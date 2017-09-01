require "dotenv/load"
require "sinatra"
require "sinatra/reloader" if development?
require "sinatra/json"
require "date"
require "pry"
require "httparty"

get "/" do
	redirect "/index.html"
end

get "/api" do
	json({success: true, message: "This is from the API"})
end

get "/deals" do
	params[:hapikey] ||= ENV["HAPIKEY"]
	params[:count] ||= 10
	params[:since] = (params[:since] || 0).to_i * 1000
	params[:offset] ||= 0
	begin
		response = HTTParty.get("https://api.hubapi.com/deals/v1/deal/recent/modified", {query: params})
		response[:success] = true
		return json(response.to_h)
	rescue Exception => error
		return json({
			success: false,
			message: error
		})
	end
end
