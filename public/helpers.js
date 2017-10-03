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
		var valA = sortFunction(itemA);
		var valB = sortFunction(itemB);
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
Date.fromObject = function(dateObject){
	return (new Date(
		dateObject.year,
		dateObject.month - 1,
		(dateObject.day || 1)
	));
}
Date.prototype.toObject = function(){
	var date = this;
	return {
		year: date.getFullYear(),
		month: date.getMonth() + 1,
		day: date.getDate()
	}
}
Date.prototype.toPrettyString = function(showDays){
	var date = this;
	var delim = '/';
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	if(showDays){
		return month + delim + date.getDate() + delim + year;
	}else{
		return month + delim + year;
	}
}
Date.prototype.getMonthWithZeroes = function(){
	var date = this;
	return ('0' + (date.getMonth()+1)).slice(-2);
}
Date.prototype.getDateWithZeroes = function(){
	var date = this;
	return ('0' + date.getDate()).slice(-2);
}
Number.prototype.toDollars = function(){
	var amount = this;
	return '$' + amount.toLocaleString(undefined,  {minimumFractionDigits: 2, maximumFractionDigits: 2});
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
