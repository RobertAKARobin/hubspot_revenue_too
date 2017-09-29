'use strict';

var DealsList = (function(){

	var control = {
		sort: {},
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
		editStatus: {},
		loadStatus: {}
	}

	var action = {
		loadDeals: function(){
			control.loadStatus = {
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
						offset: (control.loadStatus.offset || 0),
						properties: Object.keys(Deal.properties).join(',')
					}
				}).then(parseResponse);
			}

			function parseResponse(response){
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
		sort: function(propertyName){
			control.sort = {
				propertyName: propertyName,
				direction: (control.sort.direction == 'asc' ? 'desc' : 'asc')
			}
			Deal.sort(control.sort);
		},
		stopLoading: function(){
			control.loadStatus.doContinue = false;
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(control.probability);
			});
		},
		updateDeal: function(deal){
			deal.closedate = Date.fromObject(deal.closedateChunks).getTime();
			deal.startdate = Date.fromObject(deal.startdateChunks).getTime();
			m.request({
				url: '/deals/' + deal.dealId,
				method: 'PUT',
				data: {
					deal: deal
				}
			}).then(function(response){
				console.log(response)
				if(response.success){
					var input = response.data.deal;
					Deal.allById[input.dealId].updateProperties({properties: input});
				}else{
					console.log('Womp');
				}
			});
		},
		updateLimitToScheduleFilter: function(doLimit){
			control.limitToSchedule = doLimit;
			if(doLimit){
				Deal.filter(function(deal){
					return (test.isDealProbabilityInRange(deal) && test.isDealDateInRange(deal));
				});
			}else{
				Deal.filter(function(deal){
					return (deal.isDealProbabilityInRange(deal));
				});
			}
			Deal.sort(control.sort);
		}
	}

	var events = {
		hideEditor: function(event){
			control.editStatus.deal = null;
			control.editStatus.doShow = false;
		},
		highlight: function(event){
			var deal = this;
			var highlightNum = control.highlights.indexOf(deal.dealId);
			if(highlightNum >= 0){
				control.highlights.splice(highlightNum, 1);
			}else{
				control.highlights.push(deal.dealId);
			}
		},
		showEditor: function(event){
			var deal = this;
			var editedDeal = control.editStatus.deal = JSON.parse(JSON.stringify(deal));
			editedDeal.closedateChunks = deal.dates.close.toObject();
			editedDeal.startdateChunks = deal.dates.start.toObject();
			control.editStatus.doShow = true;
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
				default:
					var attr = {}
					break;
			}
			attr.value = stream();
			attr.oninput = function(event){
				var value = event.target.value;
				event.redraw = false;
				if(attr.type == 'number'){
					stream(parseInt(value));
				}else{
					stream(value)
				}
			}
			return attr;
		},
		sortable: function(propertyName){
			return {
				sortProperty: propertyName,
				sorting: (propertyName == control.sort.property ? control.sort.direction : ''),
				onclick: m.withAttr('sortProperty', action.sort)
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
					return m('th.date', views.sortable('monthlyAllocations.' + colName), date.toPrettyString());
				}),
				m('th')
			]);
		},
		subheaderRow: function(){
			return m('tr.subheaders.inputs', [
				m('th'),
				m('th', 'TOTALS'),
				m('th.number'),
				m('th.number', Deal.sum('amount').toDollars()),
				m('th'),
				control.schedule.columnNames.map(function(colName){
					return m('th.number', Deal.sum('monthlyAllocations.' + colName).toDollars());
				}),
				m('th')
			]);
		},
		bodyRow: function(deal, index){
			return m('tr.body[highlight=' + (control.highlights.indexOf(deal.dealId) >= 0 ? true : '') + ']', [
				m('td[highlight-toggle]', {onclick: events.highlight.bind(deal)}, Deal.allFiltered.length - index),
				m('th', [
					m('a[href=https://app.hubspot.com/sales/211554/deal/' + deal.dealId + ']', deal.dealname)
				]),
				m('td.number', deal['probability_']),
				m('td.number', deal.amount.toDollars()),
				m('td.number', deal.closedate.toPrettyString(true)),
				control.schedule.columnNames.map(function(colName){
					var monthCost = (deal.monthlyAllocations[colName] || 0)
					return m('td.number.revenue', (isNaN(monthCost) ? '' : monthCost.toDollars()))
				}),
				m('td', [
					m('button', {onclick: events.showEditor.bind(deal)}, 'Edit')
				])
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
					m('input[type=number]', views.input('month', control.schedule.numMonths)),
					m('span', ' months starting '),
					m('input[type=number]', views.input('month', control.schedule.startMonth)),
					m('span', '/'),
					m('input[type=number]', views.input('year', control.schedule.startYear)),
					m('button', {onclick: action.setScheduleRange}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					m('input[type=number]', views.input('percent', control.probability.probabilityLow)),
					m('span', ' and '),
					m('input[type=number]', views.input('percent', control.probability.probabilityHigh)),
					m('button', {onclick: action.setProbability}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input[type=checkbox]', {
						value: control.limitToSchedule,
						onchange: events.updateLimitToScheduleFilter
					})
				])
			];
		},
		editor: function(){
			var deal = control.editStatus.deal;
			var newDeal = {};
			return m('div.editor', [
				m('a.shadow', {onclick: events.hideEditor}, ''),
				m('div', [
					m('a.cancel', {onclick: events.hideEditor}, 'Cancel'),
					m('label', [
						m('span', 'Name'),
						(newDeal.dealname = m('input', {
							value: deal.dealname,
							placeholder: 'ACME Company - Mobile app'
						}))
					]),
					m('label', [
						m('span', 'Probability (%)'),
						(newDeal.probability_ = views.probability(deal.probability_))
					]),
					m('label', [
						m('span', 'Amount ($)'),
						(newDeal.amount = m('input[type=number]', {value: deal.amount}))
					]),
					m('label.date', [
						m('span', 'Close date'),
						(newDeal.closeMonth = views.month(deal.closedateChunks.month)),
						m('span', '/'),
						(newDeal.closeDay = views.day(deal.closedateChunks.day)),
						m('span', '/'),
						(newDeal.closeYear = views.year(deal.closedateChunks.year))
					]),
					m('label.date', [
						m('span', 'Start month'),
						(newDeal.startMonth = views.month(deal.startdateChunks.month)),
						m('span', ' / '),
						(newDeal.startYear = views.year(deal.startdateChunks.year)),
					]),
					m('label', [
						m('span', 'Schedule'),
						(newDeal.schedule = m('textarea', {
							value: deal.schedule,
							placeholder: '30%\n30%\n$4000.23\n%30'
						}))
					]),
					m('button', {onclick: events.updateDeal.bind(deal)}, 'Update')
				])
			]);
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
				(control.editStatus.doShow ? viewBlocks.editor() : null),
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
