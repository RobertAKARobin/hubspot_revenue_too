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

var Data = {
	deals: [],
	loading: {},
	editor: {},
	highlight: [],
	sort: {},
	filter: {},
	schedule: {}
};

var Deal = (function(){

	var $Class = {
		all: [],
		allById: {},
		properties: {
			createdate: 'integer',
			dealname: 'string',
			'probability_': 'integer',
			amount: 'float', 
			closedate: 'date',
			startdate: 'date',
			schedule: 'string'
		},
		new: function(){
			var deal = Object.create($Instance);
			deal = $InstanceConstructor.apply(deal, arguments);
			Deal.allById[deal.dealId] = deal;
			return deal;
		},
		filter: function(callback){
			Deal.all = [];
			Object.values(Deal.allById).forEach(function(deal){
				if(callback(deal)){
					Deal.all.push(deal);
				}
			});
			return Deal.all;
		},
		sort: function(sortProperty, sortDirection){
			return Deal.all.sort(function(dealA, dealB){
				var valA = dealA.getSortableProperty(sortProperty);
				var valB = dealB.getSortableProperty(sortProperty);
				if(valA > valB){
					return (sortDirection == 'asc' ? 1 : -1);
				}else if(valA < valB){
					return (sortDirection == 'asc' ? -1 : 1);
				}else{
					return 0;
				}
			});
		},
		sum: function(propertyName){
			var result = 0;
			for(var i = 0, l = Deal.all.length; i < l; i++){
				result += (parseFloat(help.getNestedProperty(Deal.all[i], propertyName)) || 0);
			}
			return result;
		}
	}

	var $InstanceConstructor = function(input){
		var deal = this;
		deal.dealId = input.dealId;
		deal.updateProperties(input);
		return deal;
	}

	var match = {
		scheduleString: /\$\d+\.?\d{0,2}|%\d+\.?\d{0,2}|\d+\.?\d{0,2}%|\d+\.?\d{0,2}/gm,
		nonAlphaNum: /[^a-zA-Z0-9]/g,
		nonNum: /[^\d\.]/g
	}

	var $Instance = {
		getSortableProperty: function(propertyName){
			var deal = this;
			var val = (help.getNestedProperty(deal, propertyName) || '').toString();
			var valString = val.replace(match.nonAlphaNum, '').toLowerCase();
			return (isNaN(valString) ? valString : parseFloat(val.replace(match.nonNum, '')) || '');
		},
		updateProperties: function(input){
			var deal = this;
			for(var propertyName in Deal.properties){
				var value = input.properties[propertyName];
				value = (value instanceof Object ? value.value : value);
				switch(Deal.properties[propertyName]){
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
			return deal.updateDates();
		},
		updateDates: function(){
			var deal = this;
			var HSTimeZoneOffset = (5 * 60 * 60 * 1000);
			deal.schedule = (deal.schedule || deal.amount.toString());
			deal.dates = {};
			deal.dates.close = new Date((deal.closedate || 0) + HSTimeZoneOffset);
			deal.dates.start = new Date((deal.startdate || deal.closedate) + HSTimeZoneOffset);
			deal.dates.start = new Date(deal.dates.start.getFullYear(), deal.dates.start.getMonth());
			deal.updateAllocations();
			deal.dates.end = new Date(
				deal.dates.start.getFullYear(),
				deal.dates.start.getMonth() + Object.keys(deal.monthlyAllocations).length,
				1, 0, 0, 0, -1
			);
			return deal;
		},
		updateAllocations: function(){
			var deal = this;
			var monthlyAllocations = (deal.schedule.match(match.scheduleString) || []);
			var startDate = new Date(deal.dates.start.getTime());
			deal.monthlyAllocations = {};
			for(var i = 0, l = monthlyAllocations.length; i < l; i++){
				var monthlyAllocation = monthlyAllocations[i];
				var numericValueForMonth = parseFloat(monthlyAllocation.replace(match.nonNum, ''));
				var dollarValueForMonth = numericValueForMonth;
				if(/%/.test(monthlyAllocation)){
					dollarValueForMonth = (numericValueForMonth * (deal.amount / 100));
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

	var action = {
		filter: function(){
			var probabilities = {
				probabilityLow: Data.filter.probabilityLow(),
				probabilityHigh: Data.filter.probabilityHigh()
			}
			help.query(probabilities);
			Deal.filter(test.isDealProbabilityInRange);
		},
		hideEditor: function(){
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
		loadDeals: function(){
			Data.loading = {
				total: 0,
				offset: 0,
				doContinue: true
			}
			loadNextPage();

			function loadNextPage(){
				m.request({
					url: '/deals',
					method: 'GET',
					data: {
						limit: 250,
						offset: (Data.loading.offset || 0),
						properties: Object.keys(Deal.properties).join(',')
					}
				}).then(parseResponse);
			}

			function parseResponse(response){
				if(response.success && Data.loading.doContinue){
					for(var i = 0, l = response.deals.length; i < l; i++){
						var input = response.deals[i];
						Deal.new(input).updateProperties(input);
					}
					Data.loading.offset = response.offset;
					Data.loading.total = (0 || Data.loading.total) + response.deals.length;
				}
				if(response.success && response.hasMore && Data.loading.doContinue){
					loadNextPage();
				}else{
					action.stopLoading();
				}
			}
		},
		setScheduleRange: function(){
			var numMonths = parseInt(Data.schedule.numMonths());
			var startDate = Data.schedule.startDate = new Date(
				parseInt(Data.schedule.startYear()),
				parseInt(Data.schedule.startMonth()) - 1
			);
			var endDate = Data.schedule.endDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth() + numMonths,
				1, 0, 0, -1
			);
			var counter = new Date(startDate.getTime());
			Data.schedule.columnNames = [];
			for(var i = 0; i < numMonths; i += 1){
				Data.schedule.columnNames.push(counter.getTime());
				counter.setMonth(counter.getMonth() + 1);
			}
			help.query({
				startMonth: Data.schedule.startMonth(),
				startYear: Data.schedule.startYear(),
				numMonths: Data.schedule.numMonths()
			});
		},
		showEditor: function(){
			var deal = this;
			var editedDeal = Data.editor.deal = {};
			for(var propertyName in deal){
				editedDeal[propertyName] = m.stream(deal[propertyName]);
			}
			editedDeal.closedateChunks = views.dateToChunks(deal.dates.close);
			editedDeal.startdateChunks = views.dateToChunks(deal.dates.start);
			Data.editor.doShow = true;
		},
		sort: function(propertyName){
			Data.sort.property = propertyName;
			Data.sort.direction = (Data.sort.direction == 'asc' ? 'desc' : 'asc');
			Deal.sort(Data.sort.property, Data.sort.direction);
		},
		stopLoading: function(){
			Data.loading.doContinue = false;
			Deal.filter(test.isDealProbabilityInRange);
		},
		updateDeal: function(event){
			var inputDeal = this;
			inputDeal.closedate = views.dateFromChunks(inputDeal.closedateChunks).getTime();
			inputDeal.startdate = views.dateFromChunks(inputDeal.startdateChunks).getTime();
			m.request({
				url: '/deals/' + inputDeal.dealId,
				method: 'PUT',
				data: {
					deal: inputDeal
				},
				background: true
			}).then(function(response){
				console.log(response)
				if(response.success){
					var input = response.data.deal;
					Deal.allById[input.dealId].updateProperties({properties: input});
					action.hideEditor();
				}else{
					console.log('Womp');
				}
			});
		},
		updateLimitToScheduleFilter: function(doLimit){
			var doLimit = Data.filter.limitToSchedule(doLimit);
			if(doLimit){
				Deal.filter(function(deal){
					return (test.isDealProbabilityInRange(deal) && test.isDealDateInRange(deal));
				});
			}else{
				Deal.filter(function(deal){
					return (test.isDealProbabilityInRange(deal));
				});
			}
			Deal.sort(Data.sort.property, Data.sort.direction);
		}
	}

	var test = {
		isDealDateInRange: function(deal){
			var startDate = Data.schedule.startDate;
			var endDate = Data.schedule.endDate;
			var overlapsStartDate	= (deal.dates.start <= startDate && deal.dates.end >= startDate);
			var overlapsEndDate		= (deal.dates.start <= endDate && deal.dates.end >= endDate);
			var isInsideDates		= (deal.dates.start >= startDate && deal.dates.end <= endDate);
			return (overlapsStartDate || overlapsEndDate || isInsideDates);
		},
		isDealProbabilityInRange: function(deal){
			return (
				deal['probability_'] >= Data.filter.probabilityLow
				&& deal['probability_'] <= Data.filter.probabilityHigh
			);
		}
	};

	var events = {
		loadDeals: function(event){
			event.redraw = false;
			action.loadDeals();
		},
		updateDeal: function(event){
			var deal = this;
			event.redraw = false;
			action.updateDeal(deal);
		},
		updateLimitToScheduleFilter: function(event){
			var doLimit = !!(event.target.checked);
			action.updateLimitToScheduleFilter(doLimit);
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
			for(var i = 0, l = Data.schedule.columnNames.length; i < l; i += 1){
				var colName = Data.schedule.columnNames[i];
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
				m('th.number', views.dollars(Deal.sum('amount'))),
				m('th'),
			];
			for(var i = 0, l = Data.schedule.columnNames.length; i < l; i += 1){
				var colName = Data.schedule.columnNames[i];
				row.push(m('th.number', views.dollars(Deal.sum('monthlyAllocations.' + colName))));
			}
			row.push(m('th'));
			return m('tr.subheaders.inputs', row);
		},
		bodyRow: function(deal, index){
			var nameRow = [
				m('td', {
					'highlight-toggle': true,
					onclick: action.highlight.bind(deal)
				}, Deal.all.length - index),
				m('th', [
					m('a', {
						href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
					}, deal.dealname)
				]),
				m('td.number', deal['probability_']),
				m('td.number', views.dollars(deal.amount)),
				m('td.number', views.date(deal.closedate, 1)),
			];
			for(var i = 0, l = Data.schedule.columnNames.length; i < l; i += 1){
				var monthCost = (deal.monthlyAllocations[Data.schedule.columnNames[i]] || 0);
				nameRow.push(m('td.number.revenue', (isNaN(monthCost) ? '' : views.dollars(monthCost))));
			}
			nameRow.push(m('td', [
				m('button', {
					onclick: action.showEditor.bind(deal)
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
				sortProperty: propertyName,
				sorting: (propertyName == Data.sort.property ? Data.sort.direction : ''),
				onclick: m.withAttr('sortProperty', action.sort),
			}
		},
		controls: function(){
			return [
				m('p', [
					m('span', (Data.loading.doContinue ? 'Loading ' + (Data.loading.total || '') + '...' : (Data.loading.total || 0) + ' loaded in memory. ' + (Deal.all.length || 0) + ' match the current filter')),
					m('button', {
						onclick: (Data.loading.doContinue ? action.stopLoading : action.loadDeals)
					}, (Data.loading.doContinue ? 'Cancel' : 'Refresh'))
				]),
				m('label', [
					m('span', 'Show '),
					views.dateInputs.month(Data.schedule.numMonths),
					m('span', ' months starting '),
					views.dateInputs.month(Data.schedule.startMonth),
					m('span', '/'),
					views.dateInputs.year(Data.schedule.startYear),
					m('button', {onclick: action.setScheduleRange}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					views.input(Data.filter.probabilityLow, {
						type: 'number',
						min: 0,
						max: 100
					}),
					m('span', ' and '),
					views.input(Data.filter.probabilityHigh, {
						type: 'number', 
						min: 0,
						max: 100
					}),
					m('button', {onclick: action.filter}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input', {
						type: 'checkbox',
						value: Data.filter.limitToSchedule(),
						onchange: events.updateLimitToScheduleFilter
					})
				])
			];
		},
		editor: function(){
			var deal = (Data.editor.deal || {});
			return m('div.editor', [
				m('a.shadow', {
					onclick: action.hideEditor
				}, ''),
				m('div', [
					m('a.cancel', {
						onclick: action.hideEditor
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
						views.dateInputs.all(deal.closedateChunks)
					]),
					m('label.date', [
						m('span', 'Start month'),
						views.dateInputs.year(deal.startdateChunks.year),
						m('span', ' / '),
						views.dateInputs.month(deal.startdateChunks.month)
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
			Data.filter = {
				probabilityLow: m.stream(help.query().probabilityLow || 75),
				probabilityHigh: m.stream(help.query().probabilityHigh || 99),
				limitToSchedule: m.stream(false)
			};
			Data.schedule = {
				startYear: m.stream(help.query().startYear || (new Date().getFullYear())),
				startMonth: m.stream(help.query().startMonth || (new Date().getMonth() + 1)),
				numMonths: m.stream(help.query().numMonths || 3),
			};
			action.setScheduleRange();
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				views.controls(),
				(Data.editor.doShow ? views.editor() : null),
				m('table', [
					views.headerRow(),
					views.subheaderRow(),
					Deal.all.map(views.bodyRow)
				])
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
