'use strict';

var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var http = require('http');

var ENV = require('./.env.json');

var httpServer = express();
var baseServer = http.createServer(httpServer);

baseServer
	.listen('3000', function(){
		console.log(Date().toLocaleString());
	});

httpServer
	.use('/', express.static('./public'))
	.use(bodyParser.json());

httpServer
	.get('/', function(req, res){
		res.redirect('./index.html');
	})
	.get('/deals', function(req, res){
		var query = [];
		query.push('hapikey=' + ENV['HAPIKEY']);
		query.push('limit=' + (req.query.limit || 10));
		query.push('offset=' + (req.query.offset || 0));

		(req.query.properties || '').split(',').forEach(function(propertyName){
			query.push('properties=' + propertyName);
		});

		request({
			method: 'GET',
			url: 'https://api.hubapi.com/deals/v1/deal/paged?' + query.join('&'),
		},
		function(error, response, body){
			var apiResponse = JSON.parse(body);
			apiResponse.success = true;
			res.send(apiResponse);
		});
	});
