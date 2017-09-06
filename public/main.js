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
	var dateObject = new Date(parseInt(input) || 0);
	return dateObject.toISOString().split('T')[0].substring(2);
}
help.query = function(paramsObject){
	var query = m.parseQueryString(window.location.href.match(/\?.*?$/g)[0]);
	var newurl = window.location.origin + window.location.pathname;
	if(paramsObject){
		for(var key in paramsObject){
			query[key] = paramsObject[key];
		}
		newurl += '?' + m.buildQueryString(query);
		window.history.pushState({path: newurl}, '', newurl);
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
		probability_low: m.stream(help.query().probability_low),
		probability_high: m.stream(help.query().probability_high)
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
				properties: ['createdate', 'dealname', 'probability_', 'amount', 'closedate', 'timeline'].join(',')
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
		for(var propertyName in input.properties){
			var value = (input.properties[propertyName] || {}).value;
			if(value === 0){
				deal[propertyName] = 0;
			}else{
				deal[propertyName] = (value || '');
			}
		}
		deal.amount = (deal.amount || 0);
		deal.probability = (deal.probability || 0);
		if(deal.timeline){
			deal.timeline = m.stream(deal.timeline);
			deal['$'] = actions.calculateRevenuePerMonth(deal);
		}else{
			deal.timeline = m.stream('');
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
			var valA = (a[propertyName] || '').toString().replace(nonAlphanum, '').toLowerCase();
			var valB = (b[propertyName] || '').toString().replace(nonAlphanum, '').toLowerCase();
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
	actions.calculateRevenuePerMonth = function(deal){
		var timeChunks = deal.timeline().match(/\$\d+\.?\d{0,2}|\%\d+|\d+\%/);
		var output = {};
		if(timeChunks){
			var total = deal.amount;
			var startDate = new Date(parseInt(deal.closedate) || 0);
			var startMonth = startDate.getMonth();
			var numMonths = (timeChunks.length || 0);
			for(var i = 0; i < numMonths; i++){
				var newDate = new Date(startDate.setMonth(startMonth + i));
				output[newDate.getFullYear() + '-' + newDate.getMonth()] = timeChunks[i];
			}
		}
		return output;
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
		help.query({
			probability_low: Data.filter.probability_low,
			probability_high: Data.filter.probability_high
		});
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
		return m('tr', [
			m('th', ''),
			m('th', views.sortable('createdate'), 'Created'),
			m('th', views.sortable('dealname'), 'Name'),
			m('th', views.sortable('probability_'), 'Probability'),
			m('th', views.sortable('amount'), 'Amount'),
			m('th', views.sortable('closedate'), 'Close date'),
			m('th', views.sortable('timeline'), 'Timeline'),
			m('th', ''),
			m('td', 'Test')
		]);
	}
	views.bodyRow = function(deal, index){
		var output = [
			m('th', (Data.deals.length - index)),
			m('td', help.date(deal.createdate)),
			m('td', [
				m('a', {
					href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
				}, deal.dealname),
			]),
			m('td', deal['probability_']),
			m('td', '$' + (parseFloat(deal.amount) || 0).toFixed(2)),
			m('td', help.date(deal.closedate)),
			m('td', [
				m('input', m._boundInput(deal.timeline))
			]),
			m('td', [
				m('button', {
					onclick: events.update.bind(deal)
				}, 'Update')
			]),
			m('td', JSON.stringify(deal['$']))
		];
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
