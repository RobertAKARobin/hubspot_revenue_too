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
		updateStatus: {},
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
		showInEditor: function(deal){
			var closedate = deal.closedate.toObject();
			var startdate = deal.startdate.toObject();
			control.editStatus.deal = {
				dealId: deal.dealId,
				dealname: m.stream(deal.dealname),
				probability: m.stream(deal.probability_),
				amount: m.stream(deal.amount),
				closedate: {
					month: m.stream(closedate.month),
					day: m.stream(closedate.day),
					year: m.stream(closedate.year)
				},
				startdate: {
					month: m.stream(startdate.month),
					year: m.stream(startdate.year)
				},
				schedule: m.stream(deal.schedule)
			}
			control.editStatus.doShow = true;
		},
		stopLoading: function(){
			control.loadStatus.doContinue = false;
			Deal.filter(function(deal){
				return deal.isProbabilityInRange(control.probability);
			});
		},
		updateDeal: function(deal){
			var input = JSON.parse(JSON.stringify(deal));
			input.closedate = Date.fromObject(deal.closedate).getTime();
			input.startdate = Date.fromObject(deal.startdate).getTime();
			control.updateStatus.inProgress = true;
			control.updateStatus.message = null;
			m.request({
				url: '/deals/' + deal.dealId,
				method: 'PUT',
				data: {
					deal: input
				}
			}).then(function(response){
				console.log(response)
				if(response.success){
					var input = response.data.deal;
					control.updateStatus.message = 'Updated successfully';
					control.updateStatus.inProgress = false;
					Deal.allById[input.dealId].updateProperties({properties: input});
				}else{
					control.updateStatus.message = 'Update failed';
					console.log('Womp');
				}
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
			control.updateStatus.message = null;
			action.showInEditor(deal);
		},
		updateDeal: function(event){
			var deal = this;
			action.updateDeal(deal);
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
		sortable: function(sortProperty, sortFunction){
			return {
				sortDirection: 'asc',
				isSorting: (sortProperty == control.sort.propertyName),
				onclick: function(event){
					var element = this;
					var sortDirection = (element.getAttribute('sortDirection') == 'asc' ? 'desc' : 'asc');
					control.sort.propertyName = sortProperty;
					control.sort.direction = sortDirection;
					if(sortFunction){
						Deal.sortOn(sortFunction, sortDirection)
					}else{
						Deal.sortOn(sortProperty, sortDirection);
					}
					element.setAttribute('sortDirection', sortDirection);
				}
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
				}),
				m('th')
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
				m('td.number', deal.probability_),
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
		},
		editor: function(deal){
			return m('div.editor', [
				m('a.shadow', {onclick: events.hideEditor}, ''),
				m('div', [
					m('a.cancel', {onclick: events.hideEditor}, 'Cancel'),
					m('label', [
						m('span', 'Name'),
						m('input', views.input('text', deal.dealname).merge({
							placeholder: 'ACME Company - Mobile app'
						}))
					]),
					m('label', [
						m('span', 'Probability (%)'),
						m('input', views.input('percent', deal.probability))
					]),
					m('label', [
						m('span', 'Amount ($)'),
						m('input', views.input('dollars', deal.amount))
					]),
					m('label.date', [
						m('span', 'Close date'),
						m('input', views.input('month', deal.closedate.month)),
						m('span', '/'),
						m('input', views.input('day', deal.closedate.day)),
						m('span', '/'),
						m('input', views.input('year', deal.closedate.year))
					]),
					m('label.date', [
						m('span', 'Start month'),
						m('input', views.input('month', deal.startdate.month)),
						m('span', ' / '),
						m('input', views.input('year', deal.startdate.year))
					]),
					m('label', [
						m('span', 'Schedule'),
						m('textarea', views.input('text', deal.schedule).merge({
							placeholder: '30%\n30%\n$4000.23\n%30'
						}))
					]),
					control.updateStatus.inProgress ? [
						m('button[disabled]', 'Updating...')
					] : [
						m('button', {onclick: events.updateDeal.bind(deal)}, 'Update'),
						control.updateStatus.message ? [
							m('p', control.updateStatus.message)
						] : [
							null
						]
					]
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
				(control.editStatus.doShow ? viewBlocks.editor(control.editStatus.deal) : null),
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
