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
		filter: function(){
			var probabilities = {
				probabilityLow: Data.filter.probabilityLow,
				probabilityHigh: Data.filter.probabilityHigh
			}
			_h.query(probabilities);
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
			var numMonths = parseInt(Data.schedule.numMonths);
			var startDate = Data.schedule.startDate = new Date(
				parseInt(Data.schedule.startYear),
				parseInt(Data.schedule.startMonth) - 1
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
			_h.query({
				startMonth: Data.schedule.startMonth,
				startYear: Data.schedule.startYear,
				numMonths: Data.schedule.numMonths
			});
		},
		showEditor: function(){
			var deal = this;
			var editedDeal = Data.editor.deal = JSON.parse(JSON.stringify(deal));
			editedDeal.closedateChunks = _h.date.toObject(deal.dates.close);
			editedDeal.startdateChunks = _h.date.toObject(deal.dates.start);
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
		updateDeal: function(deal){
			deal.closedate = _h.date.fromObject(deal.closedateChunks).getTime();
			deal.startdate = _h.date.fromObject(deal.startdateChunks).getTime();
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
					action.hideEditor();
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
		year: function(value){
			return m('input', {
				value: value,
				type: 'number',
				placeholder: 'YY',
				min: 2000,
				max: 2040
			});
		},
		month: function(value){
			return m('input', {
				value: value,
				type: 'number',
				placeholder: 'MM',
				min: 1,
				max: 12
			})
		},
		day: function(value){
			return m('input', {
				value: value,
				type: 'number',
				placeholder: 'DD',
				min: 1,
				max: 31
			})
		},
		probability: function(value){
			return m('input', {
				value: value,
				type: 'number',
				min: 0,
				max: 100
			})
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
					return m('th.date', views.sortable('monthlyAllocations.' + colName), _h.date.string(colName))
				}),
				m('th')
			]);
		},
		subheaderRow: function(){
			return m('tr.subheaders.inputs', [
				m('th'),
				m('th', 'TOTALS'),
				m('th.number'),
				m('th.number', _h.dollars(Deal.sum('amount'))),
				m('th'),
				Data.schedule.columnNames.map(function(colName){
					return m('th.number', _h.dollars(Deal.sum('monthlyAllocations.' + colName)));
				}),
				m('th')
			]);
		},
		bodyRow: function(deal, index){
			return m('tr.body', {
					'highlight': (Data.highlight.indexOf(deal.dealId) >= 0)
				}, [
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
					m('td.number', _h.dollars(deal.amount)),
					m('td.number', _h.date.string(deal.closedate, 1)),
					Data.schedule.columnNames.map(function(colName){
						var monthCost = (deal.monthlyAllocations[colName] || 0)
						return m('td.number.revenue', (isNaN(monthCost) ? '' : _h.dollars(monthCost)))
					}),
					m('td', [
						m('button', {
							onclick: action.showEditor.bind(deal)
						}, 'Edit')
					])
			]);
		},
		controls: function(){
			var schedule = {};
			var probability = {};
			return [
				m('p', [
					m('span', (Data.loading.doContinue ? 'Loading ' + (Data.loading.total || '') + '...' : (Data.loading.total || 0) + ' loaded in memory. ' + (Deal.all.length || 0) + ' match the current filter')),
					m('button', {
						onclick: (Data.loading.doContinue ? action.stopLoading : action.loadDeals)
					}, (Data.loading.doContinue ? 'Cancel' : 'Refresh'))
				]),
				m('label', [
					m('span', 'Show '),
					(schedule.numMonths = views.month(Data.schedule.startMonth)),
					m('span', ' months starting '),
					(schedule.startMonth = views.month(Data.schedule.startMonth)),
					m('span', '/'),
					(schedule.startYear = views.year(Data.schedule.startYear)),
					m('button', {onclick: action.setScheduleRange}, 'Update')
				]),
				m('label', [
					m('span', 'Show deals with a probability between '),
					(probability.low = views.probability(Data.filter.probabilityLow)),
					m('span', ' and '),
					(probability.high = views.probability(Data.filter.probabilityHigh)),
					m('button', {onclick: action.filter}, 'Filter')
				]),
				m('label', [
					m('span', 'Show only deals that will be in progress during the specified months?'),
					m('input', {
						type: 'checkbox',
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
				m('a.shadow', {
					onclick: action.hideEditor
				}, ''),
				m('div', [
					m('a.cancel', {
						onclick: action.hideEditor
					}, 'Cancel'),
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
						(newDeal.amount = m('input', {
							value: deal.amount,
							type: 'number'
						}))
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
				probabilityLow: (_h.query().probabilityLow || 75),
				probabilityHigh: (_h.query().probabilityHigh || 99),
				limitToSchedule: false
			};
			Data.schedule = {
				startYear: (_h.query().startYear || (new Date().getFullYear())),
				startMonth: (_h.query().startMonth || (new Date().getMonth() + 1)),
				numMonths: (_h.query().numMonths || 3),
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
