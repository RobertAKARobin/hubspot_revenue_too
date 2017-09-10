require "dotenv/load"
require "sinatra"
require "sinatra/reloader" if development?
require "sinatra/json"
require "date"
require "httparty"

get "/" do
	redirect "/index.html"
end

get "/api" do
	json({success: true, message: "This is from the API"})
end

get "/deals" do
	query = []
	query.push("hapikey=#{ENV["HAPIKEY"]}")
	query.push("limit=#{params[:limit] || 10}")
	query.push("offset=#{params[:offset] || 0}")

	params[:properties] ||= ""
	params[:properties].split(",").each do |property|
		query.push("properties=#{property}")
	end
	query = query.join("&")
	url = "https://api.hubapi.com/deals/v1/deal/paged?#{query}"

	begin
		response = HTTParty.get(url)
		# response = {}
		# response[:deals] = JSON.parse(File.read("sample.json"))
		response[:success] = true
		return json(response.to_h)
	rescue Exception => error
		return json({
			success: false,
			message: error
		})
	end
end

put "/deals/:dealId" do
	request.body.rewind
	data = JSON.parse(request.body.read)
	puts data
	return json({success: true, data: data})
end
