'use strict';

m.withAttr = function(attrName, callback, context, shouldRedraw) {
	if(shouldRedraw == undefined) shouldRedraw = true;
	return function(e) {
		e.redraw = (shouldRedraw ? true : false);
		callback.call(context || this, attrName in e.currentTarget ? e.currentTarget[attrName] : e.currentTarget.getAttribute(attrName))
	}
}

var help = {
	query: function(paramsObject){
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
	},
	getNestedProperty: function(object, propertyString){
		var propertyTree = propertyString.split('.');
		var currentProperty = null;
		for(var i = 0, l = propertyTree.length; i < l; i++){
			currentProperty = object[propertyTree[i]];
			if(currentProperty === undefined){
				object = {};
			}else{
				object = currentProperty;
			}
		}
		return currentProperty;	
	}
};

var DEFAULT = {
	probability_low: 50,
	probability_high: 75,
	schedule: {
		start_month: (new Date().getMonth() + 1),
		start_year: (new Date().getFullYear()),
		num_months: 3,
	},
	properties: {
		createdate: 'integer',
		dealname: 'string',
		'probability_': 'integer',
		amount: 'float', 
		closedate: 'date',
		startdate: 'date',
		schedule: 'string'
	},
	timeZoneOffset: (5 * 60 * 60 * 1000)
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
	highlight: [],
	serverResponse: '',
	sort: {
		property: '',
		direction: ''
	},
	filter: {
		probability_low: m.stream(help.query().probability_low || DEFAULT.probability_low),
		probability_high: m.stream(help.query().probability_high || DEFAULT.probability_high),
		limit_to_schedule: m.stream(false)
	},
	schedule: {
		start_year: m.stream(help.query().start_year || DEFAULT.schedule.start_year),
		start_month: m.stream(help.query().start_month || DEFAULT.schedule.start_month),
		num_months: m.stream(help.query().num_months || DEFAULT.schedule.num_months),
		column_names: []
	}
};

var Deal = (function(){

	var $Class = {
		new: function(){
			var deal = Object.create($Instance);
			$Instance_Constructor.apply(deal, arguments);
			return deal;
		}
	}

	var $Instance_Constructor = function(input){
		var deal = this;
		deal.dealId = input.dealId;
		deal.updateProperties(input);
		return deal;
	}

	var $Instance = {
		updateProperties: function(input){
			var deal = this;
			for(var propertyName in DEFAULT.properties){
				var value = input.properties[propertyName];
				value = (value instanceof Object ? value.value : value);
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
			deal.updateDates();
			deal.updateAllocations();
			return deal;
		},
		updateDates: function(){
			var deal = this;
			deal.schedule = (deal.schedule || deal.amount.toString());
			deal.dates = {};
			deal.dates.close = new Date((deal.closedate || 0) + DEFAULT.timeZoneOffset);
			deal.dates.start = new Date((deal.startdate || deal.closedate) + DEFAULT.timeZoneOffset);
			deal.dates.start = new Date(deal.dates.start.getFullYear(), deal.dates.start.getMonth());
			deal.monthlyAllocations = deal.updateAllocations();
			deal.dates.end = new Date(
				deal.dates.start.getFullYear(),
				deal.dates.start.getMonth() + Object.keys(deal.monthlyAllocations).length,
				1, 0, 0, 0, -1
			);
			return deal;
		},
		updateAllocations: function(){
			var deal = this;
			var matchAllNumbers = /\$\d+\.?\d{0,2}|%\d+\.?\d{0,2}|\d+\.?\d{0,2}%|\d+\.?\d{0,2}/gm;
			var matchNonNumber = /[^\d\.]/g;

			var monthlyAllocations = (deal.schedule.match(matchAllNumbers) || []);
			var startDate = new Date(deal.dates.start.getTime());
			deal.monthlyAllocations = {};
			for(var i = 0, l = monthlyAllocations.length; i < l; i++){
				var monthlyAllocation = monthlyAllocations[i];
				var numericValueForMonth = parseFloat(monthlyAllocation.replace(matchNonNumber, ''));
				var dollarValueForMonth = numericValueForMonth;
				if(/%/.test(monthlyAllocation)){
					var dollarValueForMonth = (numericValueForMonth * (deal.amount / 100));
				}
				deal.monthlyAllocations[startDate.getTime()] = dollarValueForMonth;
				startDate.setMonth(startDate.getMonth() + 1);
			}
			return deal;
		}
	}

	return $Class;

})();

var DealsList = (function(){

	var actions = {
		loadDeals: function(){
			Data.loading.total = 0;
			Data.loading.offset = 0;
			Data.loading.doContinue = true;
			Data.deals = [];
			Data.dealsById = {};
			actions.loadNextPage();
		},
		loadNextPage: function(){
			m.request({
				url: '/deals',
				method: 'GET',
				data: {
					limit: 250,
					offset: (Data.loading.offset || 0),
					properties: Object.keys(DEFAULT.properties).join(',')
				}
			}).then(actions.parseResponse);
		},
		parseResponse: function(response){
			if(response.success && Data.loading.doContinue){
				for(var i = 0, l = response.deals.length; i < l; i++){
					var input = response.deals[i];
					Data.dealsById[input.dealId] = Deal.new(input).updateProperties(input);
				}
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
		},
		filterAndAppendDeals: function(){
			var startDate = new Date(parseInt(Data.schedule.start_year()), parseInt(Data.schedule.start_month()) - 1);
			var endDate = new Date(parseInt(startDate.getFullYear()), parseInt(startDate.getMonth()) + parseInt(Data.schedule.num_months()), 1, 0, 0, -1);
			Data.deals = [];
			Object.values(Data.dealsById).forEach(function(deal){
				var progressInRange = (
					deal['probability_'] >= parseInt(Data.filter.probability_low())
					&& deal['probability_'] <= parseInt(Data.filter.probability_high())
				);
				var scheduleInRange = true;
				if(Data.filter.limit_to_schedule()){
					scheduleInRange = (
						(deal.dates.start <= startDate && deal.dates.end >= startDate)
						|| (deal.dates.start <= endDate && deal.dates.end >= endDate)
						|| (deal.dates.start >= startDate && deal.dates.end <= endDate)
					);
				}
				if(progressInRange && scheduleInRange){
					Data.deals.push(deal);
				}
			});
		},
		sortDeals: function(sortProperty, sortDirection){
			var matchNonAlphanumeric = /[^a-zA-Z0-9]/g;
			var matchNumeric = /[^0-9\.]/g;
			Data.sort.property = sortProperty;
			Data.sort.direction = (sortDirection || (Data.sort.direction == 'asc' ? 'desc' : 'asc'));
			Data.deals.sort(function(a, b){
				var valA = (help.getNestedProperty(a, sortProperty) || '').toString();
				var valB = (help.getNestedProperty(b, sortProperty) || '').toString();
				var valAString = valA.replace(matchNonAlphanumeric, '').toLowerCase();
				var valBString = valB.replace(matchNonAlphanumeric, '').toLowerCase();
				valA = (isNaN(valAString) ? valAString : parseFloat(valA.replace(matchNumeric, '')) || '');
				valB = (isNaN(valBString) ? valBString : parseFloat(valB.replace(matchNumeric, '')) || '');
				if(valA > valB){
					return (Data.sort.direction == 'asc' ? 1 : -1);
				}else if(valA < valB){
					return (Data.sort.direction == 'asc' ? -1 : 1);
				}else{
					return 0;
				}
			});
		},
		setScheduleRange: function(){
			var startDate = new Date(
				Data.schedule.start_year(),
				Data.schedule.start_month() - 1
			);
			Data.schedule.start_date = startDate.getTime();
			Data.schedule.column_names = [];
			for(var i = 0; i < Data.schedule.num_months; i += 1){
				Data.schedule.column_names.push(startDate.getTime());
				startDate.setMonth(startDate.getMonth() + 1);
			}
		},
		getSumOfDeals: function(propertyName){
			var result = 0;
			for(var i = 0, l = Data.deals.length; i < l; i++){
				result += (parseFloat(help.getNestedProperty(Data.deals[i], propertyName)) || 0);
			}
			return result;
		}
	};

	var events = {
		loadDeals: function(event){
			actions.loadDeals();
		},
		stopLoading: function(event){
			Data.loading.doContinue = false;
		},
		sort: function(propertyName){
			actions.sortDeals(propertyName);
		},
		filter: function(event){
			help.query({
				probability_low: Data.filter.probability_low,
				probability_high: Data.filter.probability_high
			});
			actions.filterAndAppendDeals();
		},
		setScheduleRange: function(event){
			help.query({
				start_month: Data.schedule.start_month,
				start_year: Data.schedule.start_year,
				num_months: Data.schedule.num_months
			});
			actions.setScheduleRange();
			actions.filterAndAppendDeals();
		},
		hideEditor: function(event){
			Data.editor.deal = null;
			Data.editor.doShow = false;
		},
		highlight: function(event){
			var deal = this;
			var highlightNum = Data.highlight.indexOf(deal.dealId);
			if(highlightNum >= 0){
				Data.highlight.splice(highlightNum, 1);
			}else{
				Data.highlight.push(deal.dealId);
			}
		},
		showEditor: function(event){
			var deal = this;
			var editedDeal = Data.editor.deal = {};
			for(var propertyName in deal){
				editedDeal[propertyName] = m.stream(deal[propertyName]);
			}
			editedDeal.closedate_chunks = views.dateToChunks(deal.dates.close);
			editedDeal.startdate_chunks = views.dateToChunks(deal.dates.start);
			Data.editor.doShow = true;
		},
		updateDeal: function(event){
			var inputDeal = this;
			inputDeal.closedate = views.dateFromChunks(inputDeal.closedate_chunks).getTime();
			inputDeal.startdate = views.dateFromChunks(inputDeal.startdate_chunks).getTime();
			m.request({
				url: '/deals/' + inputDeal.dealId,
				method: 'PUT',
				data: {
					deal: inputDeal
				}
			}).then(function(response){
				console.log(response)
				if(response.success){
					var input = response.data.deal;
					Data.dealsById[input.dealId].updateProperties({properties: input});
					events.hideEditor();
				}else{
					console.log('Womp');
				}
			});
		},
		updateLimitToScheduleFilter: function(event){
			Data.filter.limit_to_schedule(!!(event.target.checked));
			actions.filterAndAppendDeals();
			actions.sortDeals(Data.sort.property, Data.sort.direction);
		}
	};

	var views = {
		date: function(date, showDays){
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
		},
		dateToChunks: function(date){
			return {
				year: m.stream(date.getFullYear()),
				month: m.stream(date.getMonth() + 1),
				date: m.stream(date.getDate())
			}
		},
		dateFromChunks: function(dateObject){
			return (new Date(
				dateObject.year,
				dateObject.month - 1,
				(dateObject.date || 1)
			));
		},
		dateInputs: {
			year: function(year){
				return views.input(year || (new Date()).getFullYear(), {
					type: 'number',
					placeholder: 'YY',
					min: 2000,
					max: 2040
				});
			},
			month: function(month){
				return views.input(month || (new Date()).getMonth() + 1, {
					type: 'number',
					placeholder: 'MM',
					min: 1,
					max: 12
				});
			},
			date: function(date){
				return views.input(date || (new Date()).getDate(), {
					type: 'number',
					placeholder: 'DD',
					min: 1,
					max: 31
				});
			},
			all: function(dateObject){
				return [
					views.dateInputs.year(dateObject.year),
					m('span', ' / '),
					views.dateInputs.month(dateObject.month),
					m('span', ' / '),
					views.dateInputs.date(dateObject.date)
				];
			}
		},
		dollars: function(amount){
			return '$' + amount.toLocaleString(undefined,  {minimumFractionDigits: 2, maximumFractionDigits: 2});
		},
		input: function(targetStream, attrs, elementType){
			attrs = (attrs || {});
			attrs.value = targetStream;
			attrs.oninput = m.withAttr('value', targetStream, null, 0);
			return m((elementType || 'input'), attrs);
		},
		headerRow: function(){
			var row = [
				m('th'),
				m('th', views.sortable('dealname'), 'Name'),
				m('th', views.sortable('probability_'), 'Probability'),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('closedate'), 'Close date')
			];
			for(var i = 0, l = Data.schedule.column_names.length; i < l; i += 1){
				var colName = Data.schedule.column_names[i];
				row.push(m('th.date', views.sortable('monthlyAllocations.' + colName), views.date(colName)));
			}
			row.push(m('th'));
			return m('tr.colheaders', row);
		},
		subheaderRow: function(){
			var row = [
				m('th'),
				m('th', 'TOTALS'),
				m('th.number'),
				m('th.number', views.dollars(actions.getSumOfDeals('amount'))),
				m('th'),
			];
			for(var i = 0, l = Data.schedule.column_names.length; i < l; i += 1){
				var colName = Data.schedule.column_names[i];
				row.push(m('th.number', views.dollars(actions.getSumOfDeals('monthlyAllocations.' + colName))));
			}
			row.push(m('th'));
			return m('tr.subheaders.inputs', row);
		},
		bodyRow: function(deal, index){
			var nameRow = [
				m('td', {
					'highlight-toggle': true,
					onclick: events.highlight.bind(deal)
				}, Data.deals.length - index),
				m('th', [
					m('a', {
						href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
					}, deal.dealname)
				]),
				m('td.number', deal.probability_),
				m('td.number', views.dollars(deal.amount)),
				m('td.number', views.date(deal.closedate, 1)),
			];
			for(var i = 0, l = Data.schedule.column_names.length; i < l; i += 1){
				var monthCost = (deal.monthlyAllocations[Data.schedule.column_names[i]] || 0);
				nameRow.push(m('td.number.revenue', (isNaN(monthCost) ? '' : views.dollars(monthCost))));
			}
			nameRow.push(m('td', [
				m('button', {
					onclick: events.showEditor.bind(deal)
				}, 'Edit')
			]));
			return [
				m('tr.body', {
					'highlight': (Data.highlight.indexOf(deal.dealId) >= 0)
				}, nameRow)
			];
		},
		sortable: function(propertyName){
			return {
				sort_property: propertyName,
				sorting: (propertyName == Data.sort.property ? Data.sort.direction : ''),
				onclick: m.withAttr('sort_property', events.sort),
			}
		},
		controls: function(){
			return [
				m('p', [
					m('span', (Data.loading.doContinue ? 'Loading ' + (Data.loading.total || '') + '...' : Data.loading.total + ' loaded in memory. ' + (Data.deals.length || 0) + ' match the current filter')),
					m('button', {
						onclick: (Data.loading.doContinue ? events.stopLoading : events.loadDeals)
					}, (Data.loading.doContinue ? 'Cancel' : 'Refresh'))
				]),
				m('label', [
					m('span', 'Show '),
					views.dateInputs.month(Data.schedule.num_months),
					m('span', ' months starting '),
					views.dateInputs.month(Data.schedule.start_month),
					m('span', '/'),
					views.dateInputs.year(Data.schedule.start_year),
					m('button', {onclick: events.setScheduleRange}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					views.input(Data.filter.probability_low, {
						type: 'number',
						min: 0,
						max: 100
					}),
					m('span', ' and '),
					views.input(Data.filter.probability_high, {
						type: 'number', 
						min: 0,
						max: 100
					}),
					m('button', {onclick: events.filter}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input', {
						type: 'checkbox',
						value: Data.filter.limit_to_schedule(),
						onchange: events.updateLimitToScheduleFilter
					})
				])
			];
		},
		editor: function(){
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
						views.input(deal.dealname, {
							placeholder: 'ACME Company - Mobile app'
						})
					]),
					m('label', [
						m('span', 'Probability (%)'),
						views.input(deal['probability_'], {
							type: 'number',
							min: 0,
							max: 100
						})
					]),
					m('label', [
						m('span', 'Amount ($)'),
						views.input(deal.amount, {
							type: 'number'
						})
					]),
					m('label.date', [
						m('span', 'Close date'),
						views.dateInputs.all(deal.closedate_chunks)
					]),
					m('label.date', [
						m('span', 'Start month'),
						views.dateInputs.year(deal.startdate_chunks.year),
						m('span', ' / '),
						views.dateInputs.month(deal.startdate_chunks.month)
					]),
					m('label', [
						m('span', 'Schedule'),
						views.input(deal.schedule, {
							placeholder: '30%\n30%\n$4000.23\n%30'
						}, 'textarea')
					]),
					m('button', {
						onclick: events.updateDeal.bind(deal)
					}, 'Update')
				])
			]);
		}
	};

	return {
		oninit: function(){
			actions.setScheduleRange();
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
