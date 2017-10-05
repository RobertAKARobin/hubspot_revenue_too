'use strict';

m.wrap = function(wrapperNode, wrapperAttributes, list){
	var output = [];
	wrapperAttributes = (wrapperAttributes || {});
	for(var i = 0, l = list.length; i < l; i++){
		output.push(m(wrapperNode, wrapperAttributes, list[i]));
	}
	return output;
}

Array.prototype.sortOn = function(sortProperty){
	var array = this;
	var sortFunction = ((sortProperty instanceof Function) ? sortProperty : function(item){
		return item[sortProperty];
	});
	return array.sort(function(itemA, itemB){
		var valA = (sortFunction(itemA) || 0);
		var valB = (sortFunction(itemB) || 0);
		if(valA > valB){
			return -1
		}else if(valA < valB){
			return 1
		}else{
			return 0;
		}
	});
}
Location.query = function(paramsObject){
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
}
Date.prototype.toArray = function(){
	var date = this;
	return [date.getFullYear(), date.getMonthWithZeroes(), date.getDateWithZeroes()];
}
Date.prototype.getMonthWithZeroes = function(){
	var date = this;
	return ('0' + (date.getMonth()+1)).slice(-2);
}
Date.prototype.getDateWithZeroes = function(){
	var date = this;
	return ('0' + date.getDate()).slice(-2);
}
Date.prototype.getFirstOfMonth = function(){
	var date = this;
	return new Date(date.getFullYear(), date.getMonth());
}
Date.prototype.weeksUntil = function(enddate){
	var startdate = this;
	if(enddate){
		return Math.round((startdate.getTime() - enddate.getTime()) / (1000 * 60 * 60 * 24 * 7));
	}else{
		return 0;
	}
}
Date.fromYMD = function(input){
	try{
		var dateParts = input.toString().replace(/[^0-9]/g,'');
		var year = dateParts.substring(0,4);
		var month = dateParts.substring(4,6);
		var date = dateParts.substring(6);
		var outputDate = (new Date(year, month - 1));
		if(date){
			outputDate.setDate(date);
		}
		return outputDate;
	}catch(e){
		return null;
	}
}
Date.prototype.throughNMonths = function(numMonths){
	var date = this;
	var startMonth = new Date(date.getTime()).getFirstOfMonth();
	return numMonths.map(function(){
		var result = (new Date(startMonth.getTime()));
		startMonth.setMonth(startMonth.getMonth() + 1);
		return result;
	})
}
Number.prototype.toDollars = function(){
	var amount = this;
	return '$' + amount.toLocaleString(undefined,  {minimumFractionDigits: 2, maximumFractionDigits: 2});
}
Number.prototype.map = function(callback){
	var number = this;
	var output = [];
	for(var i = 0; i < number; i++){
		output.push(callback(i));
	}
	return output;
}
Number.prototype.times = function(callback){
	var number = this;
	for(var i = 0; i < number; i++){
		callback(i);
	}
	return number;
}
Number.prototype.roundTo = function(numPlaces){
	var number = this;
	var mult = Math.pow(10, numPlaces || 0);
	return (Math.round(number * mult) / mult);
}
Object.defineProperty(Object.prototype, 'merge', {
	enumerable: false,
	value: function(input){
		var object = this;
		for(var key in object){
			input[key] = object[key];
		}
		return input;
	}
})
