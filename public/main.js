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
		closedate: 'integer',
		schedule: 'string'
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
					var deal = {
						dealId: input.dealId
					}
					actions.enumerateDealProperties(deal, input);
					Data.dealsById[input.dealId] = deal;
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
		enumerateDealProperties: function(deal, input){
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
			deal.schedule = (deal.schedule || deal.amount.toString());
			actions.setMonthlyAllocations(deal);
			return deal;
		},
		filterAndAppendDeals: function(){
			var startDate = new Date(parseInt(Data.schedule.start_year()), parseInt(Data.schedule.start_month()) - 1);
			var endDate = new Date(parseInt(startDate.getFullYear()), parseInt(startDate.getMonth()) + parseInt(Data.schedule.num_months()), 1, 0, 0, -1);
			Data.deals = [];
			Object.values(Data.dealsById).forEach(function(deal){
				var dealCloseDate = new Date(deal.closedate || 0);
				var dealStartDate = new Date(dealCloseDate.getFullYear(), dealCloseDate.getMonth());
				var numMonths = Object.keys(deal.monthlyAllocations).length;
				var dealEndDate = new Date(dealStartDate.getFullYear(), dealStartDate.getMonth() + numMonths);

				var progressInRange = (
					deal['probability_'] >= parseInt(Data.filter.probability_low())
					&& deal['probability_'] <= parseInt(Data.filter.probability_high())
				);
				var scheduleInRange = true;
				if(Data.filter.limit_to_schedule()){
					scheduleInRange = (
						(dealStartDate <= startDate && dealEndDate >= startDate)
						|| (dealStartDate <= endDate && dealEndDate >= endDate)
						|| (dealStartDate >= startDate && dealEndDate <= endDate)
					);
				}
				if(progressInRange && scheduleInRange){
					Data.deals.push(deal);
				}
			});
		},
		sortDeals: function(sortProperty){
			var matchNonAlphanumeric = /[^a-zA-Z0-9]/g;
			var matchNumeric = /[^0-9\.]/g;
			Data.sort.property = sortProperty;
			Data.sort.direction = (Data.sort.direction == 'asc' ? 'desc' : 'asc');
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
		setMonthlyAllocations: function(deal){
			var matchAllNumbers = /\$\d+\.?\d{0,2}|%\d+\.?\d{0,2}|\d+\.?\d{0,2}%|\d+\.?\d{0,2}/gm;
			var monthlyAllocations = (deal.schedule.match(matchAllNumbers) || []);
			var closeDate = new Date(parseInt(deal.closedate) || 0);
			var startDate = new Date(closeDate.getFullYear(), closeDate.getMonth());

			deal.monthlyAllocations = {};
			var matchNonNumber = /[^\d\.]/g;
			for(var i = 0, l = monthlyAllocations.length; i < l; i++){
				var monthlyAllocation = monthlyAllocations[i];
				var numericValueForMonth = parseFloat(monthlyAllocation.replace(matchNonNumber, ''));
				if(/%/.test(monthlyAllocation)){
					var dollarValueForMonth = (numericValueForMonth * (deal.amount / 100));
				}else{
					var dollarValueForMonth = numericValueForMonth;
				}
				deal.monthlyAllocations[startDate.getTime()] = dollarValueForMonth;
				startDate.setMonth(startDate.getMonth() + 1);
			}
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
		showEditor: function(event){
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
		},
		updateDeal: function(event){
			var inputDeal = this;
			inputDeal.closedate = new Date(
				inputDeal.closedate_chunks.year,
				inputDeal.closedate_chunks.month - 1,
				inputDeal.closedate_chunks.date
			).getTime();
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
					var target = Data.dealsById[input.dealId];
					actions.enumerateDealProperties(target, {properties: input});
					events.hideEditor();
				}else{
					console.log('Womp');
				}
			});
		},
		updateLimitToScheduleFilter: function(event){
			Data.filter.limit_to_schedule(!!(event.target.checked));
			actions.filterAndAppendDeals();
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
				m('th.number', '$' + actions.getSumOfDeals('amount').toFixed(2)),
				m('th'),
			];
			for(var i = 0, l = Data.schedule.column_names.length; i < l; i += 1){
				var colName = Data.schedule.column_names[i];
				row.push(m('th.number', '$' + actions.getSumOfDeals('monthlyAllocations.' + colName).toFixed(2)));
			}
			row.push(m('th'));
			return m('tr.subheaders.inputs', row);
		},
		bodyRow: function(deal, index){
			var nameRow = [
				m('td', (Data.deals.length - index)),
				m('th', [
					m('a', {
						href: 'https://app.hubspot.com/sales/211554/deal/' + deal.dealId
					}, deal.dealname)
				]),
				m('td.number', deal.probability_),
				m('td.number', '$' + deal.amount.toFixed(2)),
				m('td.number', views.date(deal.closedate, 1)),
			];
			for(var i = 0, l = Data.schedule.column_names.length; i < l; i += 1){
				var monthCost = (deal.monthlyAllocations[Data.schedule.column_names[i]] || 0);
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
					views.input(Data.schedule.num_months, {
						type: 'number',
						min: 1,
						max: 12
					}),
					m('span', ' months starting '),
					views.input(Data.schedule.start_month, {
						type: 'number',
						min: 1,
						max: 12
					}),
					m('span', '/'),
					views.input(Data.schedule.start_year, {
						type: 'number',
						min: 2000,
						max: 2040
					}),
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
						m('span', 'Date'),
						views.input(deal.closedate_chunks.month, {
							type: 'number',
							placeholder: 'MM'
						}),
						'/',
						views.input(deal.closedate_chunks.date, {
							type: 'number',
							placeholder: 'DD'
						}),
						'/',
						views.input(deal.closedate_chunks.year, {
							type: 'number',
							placeholder: 'YY'
						})
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
