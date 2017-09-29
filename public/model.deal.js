'use strict';

var Deal = (function(){

	var $Class = {
		all: [],
		allById: {},
		allFiltered: [],
		properties: {
			createdate: 'integer',
			dealname: 'string',
			'probability_': 'integer',
			amount: 'float', 
			closedate: 'date',
			startdate: 'date',
			schedule: 'string'
		},
		clear: function(){
			Deal.all = [];
			Deal.allById = {};
			Deal.allFiltered = [];
		},
		new: function(){
			var deal = Object.create($Instance);
			deal = $InstanceConstructor.apply(deal, arguments);
			Deal.all.push(deal);
			Deal.allById[deal.dealId] = deal;
			return deal;
		},
		filter: function(callback){
			Deal.allFiltered = [];
			Deal.all.forEach(function(deal){
				if(callback(deal)){
					Deal.allFiltered.push(deal);
				}
			});
			return Deal.allFiltered;
		},
		sort: function(sortOptions){
			return Deal.allFiltered.sort(function(dealA, dealB){
				var valA = dealA.getSortableProperty(sortOptions.propertyName);
				var valB = dealB.getSortableProperty(sortOptions.propertyName);
				if(valA > valB){
					return (sortOptions.direction == 'asc' ? 1 : -1);
				}else if(valA < valB){
					return (sortOptions.direction == 'asc' ? -1 : 1);
				}else{
					return 0;
				}
			});
		},
		sum: function(propertyName){
			var result = 0;
			for(var i = 0, l = Deal.allFiltered.length; i < l; i++){
				result += (parseFloat(Deal.allFiltered[i].getNestedProperty(propertyName)) || 0);
			}
			return result;
		}
	}

	var $InstanceConstructor = function(input){
		var deal = this;
		deal.raw = input;
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
		getNestedProperty: function(propertyString){
			var object = this;
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
		},
		getSortableProperty: function(propertyName){
			var deal = this;
			var val = (deal.getNestedProperty(propertyName) || '').toString();
			var valString = val.replace(match.nonAlphaNum, '').toLowerCase();
			return (isNaN(valString) ? valString : parseFloat(val.replace(match.nonNum, '')) || '');
		},
		isDateInRange: function(test){
			var deal = this;
			var overlapsStartDate	= (deal.dates.start <= test.startDate &&	deal.dates.end >= test.startDate);
			var overlapsEndDate		= (deal.dates.start <= test.endDate &&		deal.dates.end >= test.endDate);
			var isInsideDates		= (deal.dates.start >= test.startDate &&	deal.dates.end <= test.endDate);
			return (overlapsStartDate || overlapsEndDate || isInsideDates);
		},
		isProbabilityInRange: function(test){
			var deal = this;
			var probability = deal.probability_;
			if(isNaN(probability)){
				return false;
			}else{
				return (probability >= test.probabilityLow && probability <= test.probabilityHigh);
			}
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
					case 'date':
						value = parseInt(value);
						deal[propertyName] = (isNaN(value) ? null : new Date(parseInt(value)));
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
