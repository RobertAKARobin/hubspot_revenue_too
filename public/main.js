'use strict';

var Data = {
	deals: [],
	loading: {},
	editor: {},
	highlight: [],
	sort: {},
	filter: {},
	schedule: {}
};

var DealsList = (function(){

	var action = {
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
						Deal.new(response.deals[i]);
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
			var numMonths = parseInt(Data.filter.schedule.numMonths);
			var startDate = Data.filter.schedule.startDate = new Date(
				parseInt(Data.filter.schedule.startYear),
				parseInt(Data.filter.schedule.startMonth) - 1
			);
			var endDate = Data.filter.schedule.endDate = new Date(
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
			Location.query({
				startMonth: Data.filter.schedule.startMonth,
				startYear: Data.filter.schedule.startYear,
				numMonths: Data.filter.schedule.numMonths
			});
		},
		sort: function(propertyName){
			Data.sort.property = propertyName;
			Data.sort.direction = (Data.sort.direction == 'asc' ? 'desc' : 'asc');
			Deal.sort(Data.sort.property, Data.sort.direction);
		},
		stopLoading: function(){
			Data.loading.doContinue = false;
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(Data.filter.probability);
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
			Data.filter.limitToSchedule = doLimit;
			if(doLimit){
				Deal.filter(function(deal){
					return (test.isDealProbabilityInRange(deal) && test.isDealDateInRange(deal));
				});
			}else{
				Deal.filter(function(deal){
					return (deal.isDealProbabilityInRange(deal));
				});
			}
			Deal.sort(Data.sort.property, Data.sort.direction);
		}
	}

	var events = {
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
		loadOrCancel: function(event){
			event.redraw = false;
			if(Data.loading.doContinue){
				action.stopLoading();
			}else{
				action.loadDeals();
			}
		},
		setProbability: function(event){
			var probabilityInputs = this;
			var probabilities = {
				low: probabilityInputs.low.dom.value,
				high: probabilityInputs.high.dom.value
			}
			Location.query({
				probabilityLow: probabilities.low,
				probabilityHigh: probabilities.high
			});
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(probabilities);
			});
		},
		setScheduleRange: function(event){
			var range = this;
			console.log(range)
		},
		showEditor: function(event){
			var deal = this;
			var editedDeal = Data.editor.deal = JSON.parse(JSON.stringify(deal));
			editedDeal.closedateChunks = deal.dates.close.toObject();
			editedDeal.startdateChunks = deal.dates.start.toObject();
			Data.editor.doShow = true;
		},
		updateDeal: function(event){
			var deal = this;
			event.redraw = false;
			action.updateDeal(deal);
		},
		updateLimitToScheduleFilter: function(event){
			var doLimit = !!(event.target.checked);
			action.updateLimitToScheduleFilter(doLimit);
		},
		updateStream: function(event){
			var stream = this;
			event.redraw = false;
			stream(event.target.value);
		}
	};

	var views = {
		input: function(type, stream){
			switch(type){
				case 'month':
					var attr = {
						placeholder: 'MM',
						min: 1,
						max: 12
					}
					break;
				case 'year':
					var attr = {
						placeholder: 'YY',
						min: 2000,
						max: 2040
					}
					break;
				case 'day':
					var attr = {
						placeholder: 'DD',
						min: 1,
						max: 31
					}
					break;
				case 'percent':
					var attr = {
						placeholder: '%%',
						min: 0,
						max: 100
					}
					break;
				default:
					var attr = {}
					break;
			}
			attr.oninput = events.updateStream.bind(stream);
			attr.value = stream();
			return attr;
		},
		sortable: function(propertyName){
			return {
				sortProperty: propertyName,
				sorting: (propertyName == Data.sort.property ? Data.sort.direction : ''),
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
				Data.schedule.columnNames.map(function(colName){
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
				Data.schedule.columnNames.map(function(colName){
					return m('th.number', Deal.sum('monthlyAllocations.' + colName).toDollars());
				}),
				m('th')
			]);
		},
		bodyRow: function(deal, index){
			return m('tr.body[highlight=' + (Data.highlight.indexOf(deal.dealId) >= 0 ? true : '') + ']', [
				m('td[highlight-toggle]', {onclick: events.highlight.bind(deal)}, Deal.all.length - index),
				m('th', [
					m('a[href=https://app.hubspot.com/sales/211554/deal/' + deal.dealId + ']', deal.dealname)
				]),
				m('td.number', deal['probability_']),
				m('td.number', deal.amount.toDollars()),
				m('td.number', deal.closedate.toPrettyString(true)),
				Data.schedule.columnNames.map(function(colName){
					var monthCost = (deal.monthlyAllocations[colName] || 0)
					return m('td.number.revenue', (isNaN(monthCost) ? '' : monthCost.toDollars()))
				}),
				m('td', [
					m('button', {onclick: events.showEditor.bind(deal)}, 'Edit')
				])
			]);
		},
		controls: function(){
			var schedule = {
				numMonths: m.stream(Data.filter.schedule.numMonths),
				startMonth: m.stream(Data.filter.schedule.startMonth),
				startYear: m.stream(Data.filter.schedule.startYear)
			};
			var probability = {
				low: m.stream(Data.filter.probability.low),
				high: m.stream(Data.filter.probability.high)
			};
			return [
				m('p', [
					m('span', (Data.loading.doContinue ? 'Loading ' + (Data.loading.total || '') + '...' : (Data.loading.total || 0) + ' loaded in memory. ' + (Deal.all.length || 0) + ' match the current filters.')),
					m('button', {onclick: events.loadOrCancel}, (Data.loading.doContinue ? 'Cancel' : 'Refresh'))
				]),
				m('label', [
					m('span', 'Show '),
					m('input[type=number]', views.input('month', schedule.numMonths)),
					m('span', ' months starting '),
					m('input[type=number]', views.input('month', schedule.startMonth)),
					m('span', '/'),
					m('input[type=number]', views.input('year', schedule.startYear)),
					m('button', {onclick: events.setScheduleRange.bind(schedule)}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					m('input[type=number]', views.input('percent', probability.low)),
					m('span', ' and '),
					m('input[type=number]', views.input('percent', probability.high)),
					m('button', {onclick: events.setProbability.bind(probability)}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input[type=checkbox]', {
						value: Data.filter.limitToSchedule,
						onchange: events.updateLimitToScheduleFilter
					})
				])
			];
		},
		editor: function(){
			var deal = Data.editor.deal;
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
			Data.filter = {
				probability: {
					low: (Location.query().probabilityLow || 75),
					high: (Location.query().probabilityHigh || 99)
				},
				schedule: {
					startYear: (Location.query().startYear || (new Date().getFullYear())),
					startMonth: (Location.query().startMonth || (new Date().getMonth() + 1)),
					numMonths: (Location.query().numMonths || 3)
				},
				limitToSchedule: false
			};
			action.setScheduleRange();
		},
		view: function(){
			return [
				m('h1', 'Deals'),
				viewBlocks.controls(),
				(Data.editor.doShow ? viewBlocks.editor() : null),
				m('table', [
					viewBlocks.headerRow(),
					viewBlocks.subheaderRow(),
					Deal.all.map(viewBlocks.bodyRow)
				])
			]
		}
	}
})();

document.addEventListener('DOMContentLoaded', function(){
	m.mount(document.getElementById('dealsList'), DealsList);
});
