'use strict';

(function(){

	var Properties = {
		all: {
			'createdate':	['Created', 'date'],
			'dealname':		['Name', 'string'],
			'probability_':	['Probability', 'integer'],
			'amount':		['Amount', 'float'],
			'closedate':	['Close date', 'date']
		}
	}
	Properties.toString = Object.keys(Properties.all).join(',');

	var help = {}
	help.date = function(input){
		input = parseInt(input);
		if(!input) return false;
		var dateObject = new Date(input);
		var dateString = dateObject.toISOString().split('T')[0].substring(2);
		return m('span', {
			timestamp: dateObject.getTime(),
			title: dateObject.toLocaleString('fullwide', {
				weekday: 'short',
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
				timeZoneName: 'short'
			})
		}, dateString);
	}

	var DealsList = (function(){

		var actions = {};
		actions.appendToList = function(input){
			var deal = {
				dealId: input.dealId
			};
			for(var name in Properties.all){
				var value = ((input.properties[name] || {}).value || null);
				switch(Properties.all[name][1]){
					case 'date':
						deal[name] = parseInt(value); break;
					case 'integer':
						deal[name] = parseInt(value); break;
					case 'float':
						deal[name] = parseFloat(value); break;
					default:
						deal[name] = value;
				}
			}
			models.dealsById[input.dealId] = deal;
			return deal;
		}
		actions.loadDeals = function(){
			models.loading.offset = 0;
			models.deals = [];
			models.dealsById = {};
			models.loading.continue = true;
			actions.loadNextPage();
		}
		actions.loadNextPage = function(){
			m.request({
				url: '/deals',
				data: {
					limit: 250,
					offset: (models.loading.offset || 0),
					properties: Properties.toString
				}
			}).then(actions.parseResponse);
		}
		actions.parseResponse = function(response){
			if(response.success && models.loading.continue){
				response.deals.forEach(actions.appendToList);
				models.loading.offset = response.offset;
				models.loading.total = (0 || models.loading.total) + response.deals.length;
			}
			if(response.success && response.hasMore && models.loading.continue){
				actions.loadNextPage();
			}else{
				models.serverResponse = response.message;
				models.deals = Object.values(models.dealsById);
				models.loading.continue = false;
			}
		}

		var events = {};
		events.loadDeals = function(event){
			actions.loadDeals();
		}
		events.stopLoading = function(event){
			models.loading.continue = false;
		}
		events.sort = function(propertyName){
			models.sortProperty = propertyName;
			models.sortDirection = (models.sortDirection == 'asc' ? 'desc' : 'asc');
			models.deals.sort(function(a, b){
				var valA = (parseFloat(a[propertyName]) || a[propertyName]);
				var valB = (parseFloat(b[propertyName]) || b[propertyName]);
				if(isNaN(valA) || isNaN(valB)){
					valA = a[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
					valB = b[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
				}
				if(models.sortDirection == 'asc'){
					return(valA > valB ? 1 : -1)
				}else{
					return(valA < valB ? 1 : -1)
				}
			});
		}

		var models = {
			loading: {
				total: null,
				offset: 0,
				continue: false
			},
			deals: [],
			dealsById: {},
			serverResponse: '',
			sortProperty: '',
			sortDirection: ''
		}

		var views = {};
		views.headerRow = function(){
			return m('tr', [
				m('th', ''),
				m('th', views.sortable('createdate'), 'Created'),
				m('th', views.sortable('dealname'), 'Name'),
				m('th', views.sortable('probability_'), 'Probability'),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('closedate'), 'Close date')
			]);
		}
		views.bodyRow = function(deal, index){
			return m('tr', [
				m('th', (models.deals.length - index)),
				m('td', help.date(deal.createdate)),
				m('td', deal.dealname),
				m('td', deal.probability_),
				m('td', '$'+ deal.amount),
				m('td', help.date(deal.closedate))
			]);
		}
		views.listTable = function(){
			return m('table', [
				views.headerRow(),
				models.deals.map(views.bodyRow)
			]);
		}
		views.sortable = function(propertyName){
			return {
				sort_property: propertyName,
				sorting: (propertyName == models.sortProperty ? models.sortDirection : ''),
				onclick: m.withAttr('sort_property', events.sort),
			}
		}
		views.controls = function(){
			var output = [];
			if(models.loading.continue){
				output.push(m('button', {onclick: events.stopLoading}, 'Cancel'));
			}else{
				output.push(m('button', {onclick: events.loadDeals}, 'Load'));
			}
			if(models.loading.total !== null){
				output.push(m('span', 'Counting ' + models.loading.total));
			}
			return output;
		}

		return {
			view: function(){
				return [
					views.controls(),
					views.listTable()
				]
			}
		}
	})();

	document.addEventListener('DOMContentLoaded', function(){
		m.mount(document.getElementById('dealsList'), DealsList);
	});
})();
