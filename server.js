'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var http = require('http');
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var path = require('path');

if(process.env['NODE_ENV'] == 'production'){
	var port = process.env['PORT'];
	var ENV = process.env;
}else{
	var port = 3000;
	var ENV = require('./.env.json');
	process.env['NODE_ENV'] = 'development';
	console.log('Dev environment');
}

var httpServer = express();
var baseServer = http.createServer(httpServer);

baseServer
	.listen(port, function(){
		console.log(Date().toLocaleString());
	});

httpServer
	.use(cookieParser())
	.use('/', express.static('./public'))
	.use(bodyParser.json());

httpServer
	.get('/authorize', function(req, res){
		res.redirect('https://app.hubspot.com/oauth/authorize?' + querystring.stringify({
			client_id: ENV['CLIENT_ID'],
			redirect_uri: ENV['REDIRECT_URI'],
			scope: 'contacts'
		}));
	})
	.get('/authorize/redirect', function(req, res){
		var requestToken = req.query.code;
		request({
			method: 'POST',
			url: 'https://api.hubapi.com/oauth/v1/token',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
			},
			form: {
				grant_type: 'authorization_code',
				client_id: ENV['CLIENT_ID'],
				client_secret: ENV['CLIENT_SECRET'],
				redirect_uri: ENV['REDIRECT_URI'],
				code: requestToken
			}
		}, function(error, response, body){
			if(error){
				res.clearCookie('access_token');
				res.redirect('/authorize');
			}else{
				res.cookie('access_token', JSON.parse(body)['access_token']);
				res.redirect('/');
			}
		});
	})
	.get('*', function(req, res, next){
		if(process.env['NODE_ENV'] == 'development' || req.cookies['access_token']){
			next();
		}else{
			res.redirect('/authorize');
		}
	})
	.get('/', function(req, res){
		res.sendFile(path.join(__dirname, './views', 'index.html'));
	})
	.get('/deals', function(req, res){
		var query = [];
		if(process.env['NODE_ENV'] == 'development'){
			query.push('hapikey=' + ENV['HAPIKEY']);
		}
		query.push('limit=' + (req.query.limit || 10));
		query.push('offset=' + (req.query.offset || 0));

		(req.query.properties || '').split(',').forEach(function(propertyName){
			query.push('properties=' + propertyName);
		});

		var params = {
			method: 'GET',
			url: 'https://api.hubapi.com/deals/v1/deal/paged?' + query.join('&')
		}
		if(process.env['NODE_ENV'] == 'production'){
			params.headers = {
				'Authorization': 'Bearer ' + req.cookies['access_token']
			}
		}

		request(params, function(error, response, body){
			var apiResponse = JSON.parse(body);
			apiResponse.success = true;
			res.send(apiResponse);
		});
	});
