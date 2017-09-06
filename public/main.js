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
help.date = function(date, showDays){
	if(!(date instanceof Date)){
		date = new Date(parseInt(date) || 0);
	}
	var year = date.getFullYear().toString().substring(2);
	var month = date.getMonth() + 1;
	if(showDays){
		return month + '/' + date.getDate() + '/' + year;
	}else{
		return month + '/' + year;
	}
}
help.query = function(paramsObject){
	var query = m.parseQueryString((window.location.href.match(/\?.*?$/g) || [])[0]);
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

var DEFAULT = {
	probability_low: 50,
	probability_high: 100,
	start_year: (new Date().getFullYear()),
	start_month: (new Date().getMonth() + 1),
	timeline_chunks: 3
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
	sort: {
		property: '',
		direction: ''
	},
	filter: {
		probability_low: m.stream(help.query().probability_low || DEFAULT.probability_low),
		probability_high: m.stream(help.query().probability_high || DEFAULT.probability_high)
	},
	timeline: {
		start_year: m.stream(help.query().start_year || DEFAULT.start_year),
		start_month: m.stream(help.query().start_month || DEFAULT.start_month),
		column_names: []
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
		deal.amount = parseFloat(deal.amount || 0);
		deal['probability_'] = parseInt(deal['probability_'] || 0);
		deal.timeline = m.stream(deal.timeline || '');
		actions.setRevenuesPerMonth(deal);
		Data.dealsById[input.dealId] = deal;
		return deal;
	}
	actions.filterAndAppendDeals = function(){
		Data.deals = [];
		Object.values(Data.dealsById).forEach(function(deal){
			if(deal['probability_'] >= Data.filter.probability_low()
			&& deal['probability_'] <= Data.filter.probability_high()){
				Data.deals.push(deal);
			}
		});
	}
	actions.sortDeals = function(propertyName){
		var nonAlphanum = /[^a-zA-Z0-9 ]/g;
		Data.sort.property = propertyName;
		Data.sort.direction = (Data.sort.direction == 'asc' ? 'desc' : 'asc');
		Data.deals.sort(function(a, b){
			var output = 0;
			var valA = (a[propertyName] || '').toString().replace(nonAlphanum, '').toLowerCase();
			var valB = (b[propertyName] || '').toString().replace(nonAlphanum, '').toLowerCase();
			valA = (isNaN(valA) ? valA : parseFloat(valA) || '');
			valB = (isNaN(valB) ? valB : parseFloat(valB) || '');
			if(valA > valB){
				output = (Data.sort.direction == 'asc' ? 1 : -1);
			}else if(valA < valB){
				output = (Data.sort.direction == 'asc' ? -1 : 1);
			}
			return output;
		});
	}
	actions.setRevenuesPerMonth = function(deal){
		var num = '\\d+\\.?\\d{0,2}';
		var matcher = new RegExp('\\$' + num + '|' + '%' + num + '|' + num + '%', 'g');
		var timeChunks = (deal.timeline().match(matcher) || []);
		var startDate = new Date(parseInt(deal.closedate) || 0);
		// Clear old time chunks
		for(var propertyName in deal){
			if(propertyName.substring(0,1) == '$'){
				deal[propertyName] = '';
			}
		}
		for(var i = 0, l = timeChunks.length; i < l; i++){
			var chunkValue = parseFloat(timeChunks[i].replace(/[^\d\.]/g,''));
			if(/%/.test(timeChunks[i])){
				chunkValue = (chunkValue * (deal.amount / 100));
			}
			deal['$' + help.date(startDate)] = chunkValue;
			startDate.setMonth(startDate.getMonth() + 1);
		}
	}
	actions.setTimelineStartDate = function(){
		var startDate = new Date(
			Data.timeline.start_year(),
			Data.timeline.start_month() - 1,
			1,	// Day of month
			0,	// Hours
			0,	// Minutes
			0,	// Seconds
			0	// Mili
		);
		Data.timeline.column_names = [];
		for(var i = 0; i < DEFAULT.timeline_chunks; i += 1){
			Data.timeline.column_names.push(help.date(startDate));
			startDate.setMonth(startDate.getMonth() + 1);
		}
	}
	actions.getSumOf = function(propertyName){
		var result = 0;
		for(var i = 0, l = Data.deals.length; i < l; i++){
			result += (Data.deals[i][propertyName] || 0);
		}
		return result;
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
	events.updateTimeChunks = function(event){
		if(event.keyCode == 13){
			help.query({
				start_month: Data.timeline.start_month,
				start_year: Data.timeline.start_year
			});
			actions.setTimelineStartDate();
		}else{
			event.redraw = false;
		}
	}
	events.update = function(event){
		var deal = this;
		m.request({
			url: '/deals/' + deal.dealId,
			method: 'PUT',
			background: true,
			data: {
				deal: deal
			}
		}).then(function(response){
			console.log(response);
			actions.setRevenuesPerMonth(deal);
			m.redraw();
		});
	}

	var views = {};
	views.headerRow = function(){
		var row = [
			m('th', ''),
			m('th', views.sortable('dealname'), 'Name'),
			m('th', views.sortable('probability_'), 'Probability'),
			m('th', views.sortable('amount'), 'Amount'),
			m('th', views.sortable('closedate'), 'Close date'),
			m('th', ''),
			m('th', ''),
			m('th.date', [
				m('span', views.sortable('$' + Data.timeline.column_names[0]), ''),
				m('input', m._boundInput(Data.timeline.start_month, {
					type: 'number',
					min: 1,
					max: 12,
					onkeyup: events.updateTimeChunks
				})),
				m('span', '/'),
				m('input', m._boundInput(Data.timeline.start_year, {
					type: 'number',
					min: 2000,
					max: 2040,
					onkeyup: events.updateTimeChunks
				}))
			])
		];
		for(var i = 1, l = Data.timeline.column_names.length; i < l; i += 1){
			var colName = Data.timeline.column_names[i];
			row.push(m('th.date', views.sortable('$' + colName), colName));
		}
		return m('tr.colheaders', row);
	}
	views.subheaderRow = function(){
		var row = [
			m('th', ''),
			m('th', [
				m('span', (Data.loading.doContinue ? 'Loading...' : Data.loading.total + ' loaded, ' + Data.deals.length + ' match')),
				m('button', {
					onclick: (Data.loading.continue ? events.stopLoading : events.loadDeals)
				}, (Data.loading.continue ? 'Cancel' : 'Refresh'))
			]),
			m('th', [
				m('input', m._boundInput(Data.filter.probability_low, {
					type: 'number',
					min: 0,
					max: 100
				})),
				m('span', ' - '),
				m('input', m._boundInput(Data.filter.probability_high, {
					type: 'number', 
					min: 0,
					max: 100
				})),
				m('button', {onclick: events.filter}, 'Filter')
			]),
			m('th.number', '$' + actions.getSumOf('amount').toFixed(2)),
			m('th', ''),
			m('th', ''),
			m('th', '')
		];
		for(var i = 0, l = Data.timeline.column_names.length; i < l; i += 1){
			var colName = Data.timeline.column_names[i];
			row.push(m('th.number', '$' + actions.getSumOf('$' + colName).toFixed(2)));
		}
		return m('tr.subheaders', row);
	}
	views.bodyRow = function(deal, index){
		var row = [
			m('th', (Data.deals.length - index)),
			m('td', [
				m('a', {
					href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
				}, deal.dealname),
			]),
			m('td.number', deal['probability_']),
			m('td.number', '$' + (parseFloat(deal.amount) || 0).toFixed(2)),
			m('td.date', help.date(deal.closedate, 1)),
			m('td', [
				m('input', m._boundInput(deal.timeline, {
					spellcheck: 'false'
				}))
			]),
			m('td', [
				m('button', {
					onclick: events.update.bind(deal)
				}, 'Update')
			])
		];
		for(var i = 0, l = Data.timeline.column_names.length; i < l; i += 1){
			var monthCost = deal['$' + Data.timeline.column_names[i]];
			row.push(m('td.number', (isNaN(monthCost) ? '' : '$' + monthCost.toFixed(2))));
		}
		return m('tr', row);
	}
	views.sortable = function(propertyName){
		return {
			sort_property: propertyName,
			sorting: (propertyName == Data.sort.property ? Data.sort.direction : ''),
			onclick: m.withAttr('sort_property', events.sort),
		}
	}

	return {
		oninit: function(){
			actions.setTimelineStartDate();
			actions.loadDeals();
		},
		view: function(){
			return [
				m('table', [
					views.headerRow(),
					views.subheaderRow(),
					Data.deals.map(views.bodyRow)
				])
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
