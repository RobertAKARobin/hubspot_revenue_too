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
	var delim = '/';
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	if(showDays){
		return month + delim + date.getDate() + delim + year;
	}else{
		return month + delim + year;
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
	probability_high: 75,
	start_year: (new Date().getFullYear()),
	start_month: (new Date().getMonth() + 1),
	timeline_chunks: 3,
	properties: {
		createdate: 'integer',
		dealname: 'string',
		'probability_': 'integer',
		amount: 'float', 
		closedate: 'integer',
		timeline: 'string'
	}
}

var Data = {
	loading: {
		total: 0,
		offset: 0,
		doContinue: false
	},
	editor: {
		doShow: false,
		deal: null
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
		Data.loading.total = 0;
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
				properties: Object.keys(DEFAULT.properties).join(',')
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
		for(var propertyName in DEFAULT.properties){
			var value = (input.properties[propertyName] || {}).value;
			switch(DEFAULT.properties[propertyName]){
				case 'string':
					deal[propertyName] = (value || '');
					break;
				case 'float':
					deal[propertyName] = (parseFloat(value) || 0);
					break;
				default:
					deal[propertyName] = (parseInt(value) || 0);
			}
		}
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
		var nonAlphanum = /[^a-zA-Z0-9]/g;
		var nonNum = /[^0-9\.]/g;
		Data.sort.property = propertyName;
		Data.sort.direction = (Data.sort.direction == 'asc' ? 'desc' : 'asc');
		Data.deals.sort(function(a, b){
			var valA = (a[propertyName] || '').toString();
			var valB = (b[propertyName] || '').toString();
			var valAString = valA.replace(nonAlphanum, '').toLowerCase();
			var valBString = valB.replace(nonAlphanum, '').toLowerCase();
			valA = (isNaN(valAString) ? valAString : parseFloat(valA.replace(nonNum, '')) || '');
			valB = (isNaN(valBString) ? valBString : parseFloat(valB.replace(nonNum, '')) || '');
			if(valA > valB){
				return (Data.sort.direction == 'asc' ? 1 : -1);
			}else if(valA < valB){
				return (Data.sort.direction == 'asc' ? -1 : 1);
			}else{
				return 0;
			}
		});
	}
	actions.setRevenuesPerMonth = function(deal){
		var num = '\\d+\\.?\\d{0,2}';
		var matcher = new RegExp('\\$' + num + '|' + '%' + num + '|' + num + '%', 'g');
		var timeChunks = (deal.timeline.match(matcher) || []);
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
			result += (parseFloat(Data.deals[i][propertyName]) || 0);
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
		help.query({
			start_month: Data.timeline.start_month,
			start_year: Data.timeline.start_year
		});
		actions.setTimelineStartDate();
	}
	events.hideEditor = function(event){
		Data.editor.deal = null;
		Data.editor.doShow = false;
	}
	events.showEditor = function(event){
		var deal = this;
		var editedDeal = Data.editor.deal = {};
		var closedate = new Date(deal.closedate);
		for(var propertyName in deal){
			editedDeal[propertyName] = m.stream(deal[propertyName]);
		}
		editedDeal.closedate_chunks = {
			year: m.stream(closedate.getFullYear(), 1),
			month: m.stream(closedate.getMonth() + 1),
			date: m.stream(closedate.getDate())
		}
		Data.editor.doShow = true;
	}

	var views = {};
	views.headerRow = function(){
		var row = [
			m('th'),
			m('th', views.sortable('dealname'), 'Name'),
			m('th', views.sortable('probability_'), 'Probability'),
			m('th', views.sortable('amount'), 'Amount'),
			m('th', views.sortable('closedate'), 'Close date'),
			m('th.number', [
				m('span', views.sortable('$' + Data.timeline.column_names[0]), ''),
				m('input', m._boundInput(Data.timeline.start_month, {
					type: 'number',
					min: 1,
					max: 12
				})),
				m('span', '/'),
				m('input', m._boundInput(Data.timeline.start_year, {
					type: 'number',
					min: 2000,
					max: 2040
				})),
				m('button', {
					onclick: events.updateTimeChunks
				}, 'Go')
			])
		];
		for(var i = 1, l = Data.timeline.column_names.length; i < l; i += 1){
			var colName = Data.timeline.column_names[i];
			row.push(m('th.date', views.sortable('$' + colName), colName));
		}
		row.push(m('th'));
		return m('tr.colheaders', row);
	}
	views.subheaderRow = function(){
		var row = [
			m('th'),
			m('th', 'TOTALS'),
			m('th.number'),
			m('th.number', '$' + actions.getSumOf('amount').toFixed(2)),
			m('th'),
		];
		for(var i = 0, l = Data.timeline.column_names.length; i < l; i += 1){
			var colName = Data.timeline.column_names[i];
			row.push(m('th.number', '$' + actions.getSumOf('$' + colName).toFixed(2)));
		}
		row.push(m('th'));
		return m('tr.subheaders.inputs', row);
	}
	views.bodyRow = function(deal, index){
		var nameRow = [
			m('td', (Data.deals.length - index)),
			m('th', [
				m('a', {
					href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
				}, deal.dealname)
			]),
			m('td.number', deal.probability_),
			m('td.number', '$' + deal.amount.toFixed(2)),
			m('td.number', help.date(deal.closedate, 1)),
		];
		for(var i = 0, l = Data.timeline.column_names.length; i < l; i += 1){
			var monthCost = (deal['$' + Data.timeline.column_names[i]] || 0);
			nameRow.push(m('td.number', (isNaN(monthCost) ? '' : '$' + monthCost.toFixed(2))));
		}
		nameRow.push(m('td', [
			m('button', {
				onclick: events.showEditor.bind(deal)
			}, 'Edit')
		]));
		return [
			m('tr.body', nameRow)
		];
	}
	views.sortable = function(propertyName){
		return {
			sort_property: propertyName,
			sorting: (propertyName == Data.sort.property ? Data.sort.direction : ''),
			onclick: m.withAttr('sort_property', events.sort),
		}
	}
	views.controls = function(){
		return [
			m('p', [
				m('button', {
					onclick: (Data.loading.doContinue ? events.stopLoading : events.loadDeals)
				}, (Data.loading.doContinue ? 'Cancel' : 'Refresh')),
				m('span', (Data.loading.doContinue ? 'Loading ' + (Data.loading.total || '') + '...' : Data.loading.total + ' loaded in memory. ' + (Data.deals.length || 0) + ' match the current filter.'))
			]),
			m('p', [
				m('button', {onclick: events.filter}, 'Filter'),
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
				}))
			])
		];
	}
	views.editor = function(){
		var deal = (Data.editor.deal || {});
		return m('div.editor', [
			m('a.shadow', {
				onclick:events.hideEditor
			}, ''),
			m('div', [
				m('a.cancel', {
					onclick: events.hideEditor
				}, 'Cancel'),
				m('label', [
					m('span', 'Name'),
					m('input', m._boundInput(deal.dealname, {
						placeholder: 'ACME Company - Mobile app'
					}))
				]),
				m('label', [
					m('span', 'Probability (%)'),
					m('input', m._boundInput(deal['probability_'], {
						type: 'number',
						min: 0,
						max: 100
					}))
				]),
				m('label', [
					m('span', 'Amount ($)'),
					m('input', m._boundInput(deal.amount, {
						type: 'number'
					}))
				]),
				m('label.date', [
					m('span', 'Date'),
					m('input', m._boundInput(deal.closedate_chunks.month, {
						type: 'number',
						placeholder: 'MM'
					})),
					'/',
					m('input', m._boundInput(deal.closedate_chunks.date, {
						type: 'number',
						placeholder: 'DD'
					})),
					'/',
					m('input', m._boundInput(deal.closedate_chunks.year, {
						type: 'number',
						placeholder: 'YY'
					}))
				]),
				m('label', [
					m('span', 'Timeline'),
					m('input', m._boundInput(deal.timeline, {
						placeholder: '30%, 30%, $4000.23, %30'
					}))
				]),
				m('button', {

				}, 'Update')
			])
		]);
	}

	return {
		oninit: function(){
			actions.setTimelineStartDate();
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				views.controls(),
				(Data.editor.doShow ? views.editor() : null),
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
