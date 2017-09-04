'use strict';

var Properties = {
	all: {
		'createdate':	['Created', 'date'],
		'dealname':		['Name', 'string'],
		'probability_':	['Probability', 'integer'],
		'amount':		['Amount', 'dollars'],
		'closedate':	['Close date', 'date'],
		'timeline':		['Timeline', 'string', 'editable']
	}
}
Properties.toString = Object.keys(Properties.all).join(',');

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
	var dateObject = new Date(parseInt(input) || 0);
	return dateObject.toISOString().split('T')[0].substring(2);
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

var Data = {
	loading: {
		total: null,
		offset: 0,
		doContinue: false
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
		Data.loading.total = null;
		Data.loading.offset = 0;
		Data.loading.doContinue = true;
		Data.deals = [];
		Data.dealsById = {};
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
		if(response.success && Data.loading.doContinue){
			response.deals.forEach(actions.parseOneDeal);
			Data.loading.offset = response.offset;
			Data.loading.total = (0 || Data.loading.total) + response.deals.length;
		}
		if(response.success && response.hasMore && Data.loading.doContinue){
			actions.loadNextPage();
		}else{
			Data.serverResponse = response.message;
			actions.filterAndAppendDeals();
			Data.loading.doContinue = false;
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
					value = help.date(value); break;
				case 'integer':
					value = (parseInt(value) || 0); break;
				case 'float':
					value = (parseFloat(value) || 0); break;
				case 'dollars':
					value = '$' + (parseFloat(value) || 0).toFixed(2); break;
				default:
					value = (value || '');
			}
			if(Properties.all[name][2] == 'editable'){
				deal[name] = m.stream(value)
			}else{
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
		var nonAlphanum = /[^a-zA-Z0-9 ]/g;
		Data.sortProperty = propertyName;
		Data.sortDirection = (Data.sortDirection == 'asc' ? 'desc' : 'asc');
		Data.deals.sort(function(a, b){
			var output = 0;
			var valA = a[propertyName].toString().replace(nonAlphanum, '').toLowerCase();
			var valB = b[propertyName].toString().replace(nonAlphanum, '').toLowerCase();
			valA = (isNaN(valA) ? valA : parseFloat(valA) || '');
			valB = (isNaN(valB) ? valB : parseFloat(valB) || '');
			if(valA > valB){
				output = (Data.sortDirection == 'asc' ? 1 : -1);
			}else if(valA < valB){
				output = (Data.sortDirection == 'asc' ? -1 : 1);
			}
			return output;
		});
	}

	var events = {};
	events.loadDeals = function(event){
		actions.loadDeals();
	}
	events.stopLoading = function(event){
		Data.loading.doContinue = false;
	}
	events.sort = function(propertyName){
		actions.sortDeals(propertyName);
	}
	events.filter = function(event){
		actions.filterAndAppendDeals();
	}
	events.update = function(event){
		var deal = this;
		m.request({
			url: '/deals/' + deal.dealId,
			method: 'PUT',
			data: {
				deal: deal
			}
		}).then(function(response){
			console.log(response)
		});
	}

	var views = {};
	views.headerRow = function(){
		var output = [
			m('th', '')
		];
		var property;
		for(var propertyName in Properties.all){
			property = Properties.all[propertyName];
			output.push(m('th', views.sortable(propertyName), property[0]));
		}
		output.push(m('th', ''));
		return m('tr', output);
	}
	views.bodyRow = function(deal, index){
		var output = [
			m('th', (Data.deals.length - index))
		];
		for(var propertyName in Properties.all){
			if(propertyName == 'dealname'){
				output.push(m('td', [
					m('a', {
						href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
					}, deal.dealname)
				]))
			}else if(Properties.all[propertyName][2] == 'editable'){
				output.push(m('td', [
					m('input', m._boundInput(deal[propertyName]))
				]));
			}else{
				output.push(m('td', deal[propertyName]));
			}
		}
		output.push(m('td', [
			m('button', {
				onclick: events.update.bind(deal)
			}, 'Update')
		]));
		return m('tr', output);
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
		if(Data.loading.doContinue){
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
