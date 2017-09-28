'use strict';

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
				result += (parseFloat(_h.getNestedProperty(Deal.all[i], propertyName)) || 0);
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
			var val = (_h.getNestedProperty(deal, propertyName) || '').toString();
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
