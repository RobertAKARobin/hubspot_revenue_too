'use strict';

var Properties = {
	all: {
		'createdate':	['Created', 'date'],
		'dealname':		['Name', 'string'],
		'probability_':	['Probability', 'integer'],
		'amount':		['Amount', 'dollars'],
		'closedate':	['Close date', 'date']
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
					deal[name] = help.date(value); break;
				case 'integer':
					deal[name] = (parseInt(value) || 0); break;
				case 'float':
					deal[name] = (parseFloat(value) || 0); break;
				case 'dollars':
					deal[name] = '$' + (parseFloat(value) || 0).toFixed(2); break;
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
		var nonAlphanum = /[^a-zA-Z0-9 ]/g;
		Data.sortProperty = propertyName;
		Data.sortDirection = (Data.sortDirection == 'asc' ? 'desc' : 'asc');
		Data.deals.sort(function(a, b){
			var valA = a[propertyName].toString().replace(nonAlphanum, '').toLowerCase();
			var valB = b[propertyName].toString().replace(nonAlphanum, '').toLowerCase();
			valA = (parseFloat(valA) === 0 ? 0 : (parseFloat(valA) || a[propertyName]));
			valB = (parseFloat(valB) === 0 ? 0 : (parseFloat(valB) || a[propertyName]));
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
		var output = [
			m('th', '')
		];
		var property;
		for(var propertyName in Properties.all){
			property = Properties.all[propertyName];
			output.push(m('th', views.sortable(propertyName), property[0]));
		}
		return m('tr', output);
	}
	views.bodyRow = function(deal, index){
		var output = [
			m('th', (Data.deals.length - index))
		];
		for(var propertyName in Properties.all){
			output.push(m('td', deal[propertyName]));
		}
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
