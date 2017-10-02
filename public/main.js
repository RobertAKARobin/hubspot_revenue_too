'use strict';

var DealsList = (function(){

	var control = {
		sort: {
			activeSortProperty: null,
			directions: {}
		},
		probability: {
			probabilityLow: m.stream(Location.query().probabilityLow || 75),
			probabilityHigh: m.stream(Location.query().probabilityHigh || 99)
		},
		schedule: {
			startYear: m.stream(Location.query().startYear || (new Date().getFullYear())),
			startMonth: m.stream(Location.query().startMonth || (new Date().getMonth() + 1)),
			numMonths: m.stream(Location.query().numMonths || 3)
		},
		limitToSchedule: false,
		highlights: [],
		loadStatus: {}
	}

	var action = {
		loadDeals: function(){
			control.loadStatus = {
				offset: 0,
				doContinue: true
			}
			Deal.clear();
			loadNextPage();

			function loadNextPage(){
				m.request({
					url: '/deals',
					method: 'GET',
					data: {
						limit: 250,
						offset: (control.loadStatus.offset || 0),
						properties: Object.keys(Deal.properties).join(',')
					}
				}).then(parseResponse);
			}

			function parseResponse(response){
				console.log(response)
				if(response.success && control.loadStatus.doContinue){
					response.deals.forEach(Deal.new);
					control.loadStatus.offset = response.offset;
				}
				if(response.success && response.hasMore && control.loadStatus.doContinue){
					loadNextPage();
				}else{
					action.stopLoading();
				}
			}
		},
		setProbability: function(){
			var input = Object.values(JSON.parse(JSON.stringify(control.probability)));
			control.probability.probabilityLow(Math.min.apply(null, input));
			control.probability.probabilityHigh(Math.max.apply(null, input));
			Location.query(control.probability);
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(control.probability);
			});
		},
		setScheduleRange: function(){
			var numMonths = parseInt(control.schedule.numMonths);
			var startDate = control.schedule.startDate = new Date(
				parseInt(control.schedule.startYear),
				parseInt(control.schedule.startMonth) - 1
			);
			var endDate = control.schedule.endDate = new Date(
				startDate.getFullYear(),
				startDate.getMonth() + numMonths,
				1, 0, 0, -1
			);
			var counter = new Date(startDate.getTime());
			control.schedule.columnNames = [];
			for(var i = 0; i < numMonths; i += 1){
				control.schedule.columnNames.push(counter.getTime());
				counter.setMonth(counter.getMonth() + 1);
			}
			Location.query({
				startMonth: control.schedule.startMonth,
				startYear: control.schedule.startYear,
				numMonths: control.schedule.numMonths
			});
		},
		stopLoading: function(){
			control.loadStatus.doContinue = false;
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(control.probability);
			});
		},
		updateLimitToScheduleFilter: function(doLimit){
			control.limitToSchedule = doLimit;
			if(doLimit){
				Deal.filter(function(deal){
					return (deal.isProbabilityInRange(control.probability) && deal.isDateInRange(control.schedule));
				});
			}else{
				Deal.filter(function(deal){
					return (deal.isProbabilityInRange(control.probability));
				});
			}
			if(control.sort.propertyName){
				Deal.sortOn(control.sort.propertyName, control.sort.direction);
			}
		}
	}

	var events = {
		highlight: function(event){
			var deal = this;
			var highlightNum = control.highlights.indexOf(deal.dealId);
			if(highlightNum >= 0){
				control.highlights.splice(highlightNum, 1);
			}else{
				control.highlights.push(deal.dealId);
			}
		},
		sort: function(event){
			var sortOptions = this;
			var sortProperty = sortOptions.sortProperty;
			var sortFunction = sortOptions.sortFunction;
			var sortDirection = (control.sort.directions[sortProperty] == 'asc' ? 'desc' : 'asc');
			Deal.sortOn((sortFunction || sortProperty), sortDirection)
			control.sort.directions[sortProperty] = sortDirection;
			control.sort.activeSortProperty = sortProperty;
		},
		updateInput: function(event){
			var attr = this;
			var stream = attr.stream;
			var value = event.target.value;
			event.redraw = false;
			if(attr.type == 'number'){
				stream(parseInt(value));
			}else{
				stream(value)
			}
		}
	}

	var views = {
		input: function(type, stream){
			switch(type){
				case 'month':
					var attr = {
						type: 'number',
						placeholder: 'MM',
						min: 1,
						max: 12
					}
					break;
				case 'year':
					var attr = {
						type: 'number',
						placeholder: 'YY',
						min: 2000,
						max: 2040
					}
					break;
				case 'day':
					var attr = {
						type: 'number',
						placeholder: 'DD',
						min: 1,
						max: 31
					}
					break;
				case 'percent':
					var attr = {
						type: 'number',
						placeholder: '%%',
						min: 0,
						max: 100
					}
					break;
				case 'dollars':
					var attr = {
						type: 'number',
						placeholder: '$.$$',
						step: '0.01'
					}
					break;
				default:
					var attr = {}
					break;
			}
			attr.stream = stream;
			attr.value = stream();
			attr.oninput = events.updateInput.bind(attr);
			return attr;
		},
		sortable: function(sortProperty, sortFunction){
			return {
				isCurrentlySorted: (sortProperty == control.sort.activeSortProperty),
				sortDirection: (control.sort.directions[sortProperty] || 'desc'),
				onclick: events.sort.bind({
					sortProperty: sortProperty,
					sortFunction: sortFunction
				})
			}
		}
	}

	var viewBlocks = {
		headerRow: function(){
			return m('tr.colheaders', [
				m('th'),
				m('th', views.sortable('dealname'), 'Name'),
				m('th', views.sortable('probability_'), 'Probability'),
				m('th', views.sortable('amount'), 'Amount'),
				m('th', views.sortable('closedate'), 'Close date'),
				control.schedule.columnNames.map(function(colName){
					var date = new Date(colName);
					return m('th.date', views.sortable('monthlyAllocations.' + colName, function(deal){
						return parseFloat(deal.monthlyAllocations[colName]) || 0;
					}), date.toPrettyString());
				})
			]);
		},
		subheaderRow: function(){
			return m('tr.subheaders.inputs', [
				m('th'),
				m('th', 'TOTALS'),
				m('th.number'),
				m('th.number', Deal.allFiltered.reduce(function(sum, deal){
					return sum += (deal.amount || 0);
				}, 0).toDollars()),
				m('th'),
				control.schedule.columnNames.map(function(colName){
					return m('th.number', Deal.allFiltered.reduce(function(sum, deal){
						return sum += (deal.monthlyAllocations[colName] || 0);
					}, 0).toDollars());
				})
			]);
		},
		bodyRow: function(deal, index){
			return m('tr.body[highlight=' + (control.highlights.indexOf(deal.dealId) >= 0 ? true : '') + ']', [
				m('td[highlight-toggle]', {onclick: events.highlight.bind(deal)}, Deal.allFiltered.length - index),
				m('th', [
					m('a[href=https://app.hubspot.com/sales/211554/deal/' + deal.dealId + ']', deal.dealname)
				]),
				m('td.number', deal.probability_),
				m('td.number', deal.amount.toDollars()),
				m('td.number', deal.closedate.toPrettyString(true)),
				control.schedule.columnNames.map(function(colName){
					var monthCost = (deal.monthlyAllocations[colName] || 0)
					return m('td.number.revenue', (isNaN(monthCost) ? '' : monthCost.toDollars()))
				})
			]);
		},
		controls: function(){
			return [
				m('p', [
					control.loadStatus.doContinue ? [
						m('span', 'Loading ' + (Deal.all.length || '') + '...'),
						m('button', {onclick: action.stopLoading}, 'Cancel')
					] : [
						m('span', Deal.all.length + ' loaded in memory. ' + (Deal.allFiltered.length || 0) + ' match the current filters.'),
						m('button', {onclick: action.loadDeals}, 'Refresh')
					]
				]),
				m('label', [
					m('span', 'Show '),
					m('input', views.input('month', control.schedule.numMonths)),
					m('span', ' months starting '),
					m('input', views.input('month', control.schedule.startMonth)),
					m('span', '/'),
					m('input', views.input('year', control.schedule.startYear)),
					m('button', {onclick: action.setScheduleRange}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					m('input', views.input('percent', control.probability.probabilityLow)),
					m('span', ' and '),
					m('input', views.input('percent', control.probability.probabilityHigh)),
					m('button', {onclick: action.setProbability}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input', {
						type: 'checkbox',
						value: control.limitToSchedule,
						onchange: m.withAttr('checked', action.updateLimitToScheduleFilter)
					})
				])
			];
		}
	};

	return {
		oninit: function(){
			action.setScheduleRange();
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				viewBlocks.controls(),
				m('table', [
					viewBlocks.headerRow(),
					viewBlocks.subheaderRow(),
					Deal.allFiltered.map(viewBlocks.bodyRow)
				])
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
