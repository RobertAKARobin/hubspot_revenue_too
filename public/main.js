'use strict';

m._boundInput = function(stream, attrs){
	var attrs = (attrs || {});
	attrs.value = stream();
	attrs.oninput = function(event){
		event.redraw = false;
		m.withAttr('value', stream).call({}, event);
	};
	return attrs;
};

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
help.query = function(paramsObject){
	var query = m.parseQueryString(window.location.search);
	if(paramsObject){
		for(var key in paramsObject){
			query[key] = paramsObject[key];
		}
		window.location.search = m.buildQueryString(query);
	}
	return query;
}

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

var Data = {
	loading: {
		total: null,
		offset: 0,
		continue: false
	},
	deals: [],
	dealsById: {},
	serverResponse: '',
	sortProperty: '',
	sortDirection: '',
	filter: {
		matchQuantity: null,
		probability_low: m.stream(help.query().probability_low || 50),
		probability_high: m.stream(help.query().probability_high || 100)
	}
};

var DealsList = (function(){

	var actions = {};
	actions.loadDeals = function(){
		Data.loading.offset = 0;
		Data.deals = [];
		Data.dealsById = {};
		Data.loading.continue = true;
		Data.filter.matchQuantity = null;
		actions.loadNextPage();
	}
	actions.loadNextPage = function(){
		m.request({
			url: '/deals',
			data: {
				limit: 250,
				offset: (Data.loading.offset || 0),
				properties: Properties.toString
			}
		}).then(actions.parseResponse);
	}
	actions.parseResponse = function(response){
		if(response.success && Data.loading.continue){
			response.deals.forEach(actions.parseOneDeal);
			Data.loading.offset = response.offset;
			Data.loading.total = (0 || Data.loading.total) + response.deals.length;
		}
		if(response.success && response.hasMore && Data.loading.continue){
			actions.loadNextPage();
		}else{
			Data.serverResponse = response.message;
			actions.filterAndAppendDeals();
			Data.loading.continue = false;
		}
	}
	actions.parseOneDeal = function(input){
		var deal = {
			dealId: input.dealId
		};
		for(var name in Properties.all){
			var value = ((input.properties[name] || {}).value || null);
			switch(Properties.all[name][1]){
				case 'date':
					deal[name] = (parseInt(value) || 0); break;
				case 'integer':
					deal[name] = (parseInt(value) || 0); break;
				case 'float':
					deal[name] = (parseFloat(value) || 0); break;
				default:
					deal[name] = value;
			}
		}
		Data.dealsById[input.dealId] = deal;
		return deal;
	}
	actions.filterAndAppendDeals = function(){
		Data.filter.matchQuantity = null;
		Data.deals = [];
		Object.values(Data.dealsById).forEach(function(deal){
			if(deal['probability_'] >= Data.filter.probability_low()
			&& deal['probability_'] <= Data.filter.probability_high()){
				Data.deals.push(deal);
			}
		});
		Data.filter.matchQuantity = Data.deals.length;
	}
	actions.sortDeals = function(propertyName){
		Data.sortProperty = propertyName;
		Data.sortDirection = (Data.sortDirection == 'asc' ? 'desc' : 'asc');
		Data.deals.sort(function(a, b){
			var valA = (parseFloat(a[propertyName]) || a[propertyName]);
			var valB = (parseFloat(b[propertyName]) || b[propertyName]);
			if(isNaN(valA) || isNaN(valB)){
				valA = a[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
				valB = b[propertyName].toString().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
			}
			if(Data.sortDirection == 'asc'){
				return(valA > valB ? 1 : -1)
			}else{
				return(valA < valB ? 1 : -1)
			}
		});
	}

	var events = {};
	events.loadDeals = function(event){
		actions.loadDeals();
	}
	events.stopLoading = function(event){
		Data.loading.continue = false;
	}
	events.sort = function(propertyName){
		actions.sortDeals(propertyName);
	}
	events.filter = function(event){
		actions.filterAndAppendDeals();
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
			m('th', (Data.deals.length - index)),
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
			Data.deals.map(views.bodyRow)
		]);
	}
	views.sortable = function(propertyName){
		return {
			sort_property: propertyName,
			sorting: (propertyName == Data.sortProperty ? Data.sortDirection : ''),
			onclick: m.withAttr('sort_property', events.sort),
		}
	}
	views.filter = function(){
		return [
			m('span', 'Probability between '),
			m('input', m._boundInput(Data.filter.probability_low, {
				type: 'number',
				min: 0,
				max: 100
			})),
			m('span', ' and '),
			m('input', m._boundInput(Data.filter.probability_high, {
				type: 'number', 
				min: 0,
				max: 100
			})),
			m('button', {onclick: events.filter}, 'Filter')
		]
	}
	views.triggers = function(){
		var output = [];
		if(Data.loading.continue){
			output.push(m('button', {onclick: events.stopLoading}, 'Cancel'));
		}else{
			output.push(m('button', {onclick: events.loadDeals}, 'Load'));
		}
		if(Data.loading.total !== null){
			output.push(m('span', Data.loading.total + ' loaded'))
		}
		if(Data.filter.matchQuantity !== null){
			output.push(m('span', ', ' + Data.filter.matchQuantity + ' match'))
		}
		return output;
	}

	return {
		view: function(){
			return [
				m('p', views.filter()),
				m('p', views.triggers()),
				views.listTable()
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
