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
		sortOn: function(sortProperty, sortDirection){
			if(sortProperty instanceof Function){
				var sortFunction = sortProperty;
			}else{
				switch(Deal.properties[sortProperty]){
					case 'string':
						var sortFunction = function(deal){
							return deal[sortProperty].toString().toLowerCase().replace(/[^a-zA-Z0-9]/g,'');
						}
						break;
					case 'float':
						var sortFunction = function(deal){
							return parseFloat(deal[sortProperty]) || 0;
						}
						break;
					case 'integer':
						var sortFunction = function(deal){
							return parseInt(deal[sortProperty]) || 0;
						}
						break;
					default:
						var sortFunction = function(deal){
							return deal[sortProperty];
						}
				}
			}
			Deal.allFiltered.sortOn(sortFunction);
			if(sortDirection == 'asc'){
				Deal.allFiltered.reverse();
			}
			return Deal.allFiltered;
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
		isDateInRange: function(test){
			var deal = this;
			var overlapsStartDate	= (deal.startdate <= test.startDate &&	deal.enddate >= test.startDate);
			var overlapsEndDate		= (deal.startdate <= test.endDate &&	deal.enddate >= test.endDate);
			var isInsideDates		= (deal.startdate >= test.startDate &&	deal.enddate <= test.endDate);
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
			deal.closedate = new Date((deal.closedate || 0) + HSTimeZoneOffset);
			deal.startdate = new Date((deal.startdate || deal.closedate) + HSTimeZoneOffset);
			deal.startdate = new Date(deal.startdate.getFullYear(), deal.startdate.getMonth());
			deal.updateAllocations();
			deal.enddate = new Date(
				deal.startdate.getFullYear(),
				deal.startdate.getMonth() + Object.keys(deal.monthlyAllocations).length,
				1, 0, 0, 0, -1
			);
			return deal;
		},
		updateAllocations: function(){
			var deal = this;
			var monthlyAllocations = (deal.schedule.match(match.scheduleString) || []);
			var startDate = new Date(deal.startdate.getTime());
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
