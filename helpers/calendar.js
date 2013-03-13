var rssparser = require('rssparser')
    , http = require('http')
    , spreadsheet = require('./spreadsheet');


// curl 'http://www.google.com/calendar/feeds/neopersistence.com_3p7hh97rfcu76paib7l2dp4llo@group.calendar.google.com/public/full?alt=json-in-script&callback=insertAgenda&orderby=starttime&max-results=15&singleevents=true&sortorder=ascending&futureevents=true'

function events2(fun, filter,calendar) {
    // graphdb-belgium/events/81881472
    calendar = calendar || "neopersistence.com_3p7hh97rfcu76paib7l2dp4llo@group.calendar.google.com";
    var results = 1;
    var url="/calendar/feeds/"+calendar+
        "/public/full?alt=json&orderby=starttime&max-results="+results+
        "&singleevents=true&sortorder=ascending&futureevents=true";
//	console.log(url);
    http.get({host: 'www.google.com', path: url},
        function(r) {
            r.setEncoding('utf8');
            var content="";
            r.on("end", function (x) {
                var json = JSON.parse(content);
                fun(json.feed.entry);
            });
            r.on("data", function(data) {
                content += data;    
            })
        })
}

function events(fun, filter) {
    var calendarUrl='http://www.google.com/calendar/feeds/neopersistence.com_3p7hh97rfcu76paib7l2dp4llo%40group.calendar.google.com/public/basic?orderby=starttime&sortorder=ascending&max-results=30&futureevents=true&hl=en';
    rssparser.parseURL(calendarUrl, { headers: {'Accept-Language':'en'}}, function(err, out){
        function event_prop(item,name,regexp,type) {
            var match = item.summary.match(regexp);
            item[name]=match == null ? '' : type || match[1];
        }
        var items=out.items.map(function(item) {
			item.Title=item.title;
            event_prop(item, 'Start', /When: (.+?)(\n|<br *\/>)/);
            event_prop(item, 'Status', /Event Status: (.+?)(\n|<br *\/>)/);
            event_prop(item, 'Location', /Where: (.+?)(\n|<br *\/>)/);
            event_prop(item, 'Description', /Event Description: ([\s\S]+)$/);
            event_prop(item, 'Url', /Event Description: <a +href="(.+?)".*>.+?<\/a>/);
            event_prop(item, 'UrlText', /Event Description: <a +href=".+?".*>(.+?)<\/a>/);
            item.Description = item.Description.replace(/^<a +href=".+?".*>.+?<\/a> */,"");
            if (item.Url && item.Url.match(/http:\/\/www.google.com\/url\?q=/)) {
              var url = item.Url.replace(/http:\/\/www.google.com\/url\?q=/, "");
              url=decodeURIComponent(url);
              url=url.replace(/&amp;ust=.*$/,"");
              item.Url=url;
            }
            //http://seattle.meetup.neo4j.org/events/102039672/
            var meetup=item.Url.match(/^https?:\/\/(?:www\.)?meetup.com\/(.+)(?:\/events\/(\d+))/) || 
                       item.Url.match(/^https?:(\/\/\w+)\.meetup.neo4j.org\/(?:events\/(\d+))/);
            if (meetup){
                item.Group=meetup[1].replace(/^\/\//,"graphdb-");
                item.Meetup=meetup[2];
            }
			function assignType(item,content) {
				if (item.Type) return item;
				if (content.match(/(Training|Tutorial|Workshop)/i)) {item.Type="Training"; return item}
				if (content.match(/Webinar/i)) { item.Type="Webinar"; return item; }
				if (content.match(/(Conference|Sponsorship)/i)) {item.Type="Conference"; return item;}
				if (content.match(/Meetup/i)) {item.Type="Meetup";return item;}
				return item;
			}
			assignType(assignType(item,item.Title),item.Description);
			if (!item.Type) item.Type="Conference";
			
			function assignArea(item, content) {
				if (!content || !item || item.Type=="Webinar" || item.Area) return item;
				if (/(Los Angeles|CA|US|USA|Boston|DC|Washington|Valley|Seattle|NY|New York|San Francisco|Dallas|Canada|Vancouver|Montreal|Philadelphia)/.test(content)) {
					 item.Area="US"; return item; }
				if (/(Denmark|London|Paris|United Kingdom|Copenhagen|Rotterdam|Netherlands|Belgium|UK|France|Sweden|Malm|Stockholm|Amsterdam|Sweden)/.test(content)) {
					item.Area="EU"; return item; 
				}
				if (/(Berlin|GmbH|DE|Munich|München|Hamburg|Düsseldorf|Zurich|Zürich|Wien|Frankfurt|Dresden|Österreich|Switzerland|Germany|Schweiz|CH|AT)/.test(content)) {
					item.Area="DE"; return item; 
				}
				return item;
			}
			assignArea(assignArea(item,item.Location),item.Title);
			if (!item.Area) item.Area='WORLD';
			
			var dateStr=item.Start.replace(/(\d)(am|pm|AM|PM)/,"$1 $2").replace(/ (\d{1,2}) (am|pm|AM|PM)/," $1:00 $2").replace(/\s+to\s+.+?( [A-Z]{2,3})?$/,"$1");
			item.Date = new Date(Date.parse(dateStr));
            // console.log(item)
			// console.log(item.Area, item['Location'], item.Title,dateStr,item.Date,item.Group);
			item.Origin="Calendar";
            return item;
        });
        if (filter) fun(items.filter(filter));
        else fun(items)
    });
}

function mergeEvents(events,items) {
	var urls=events.map(function(e) {return e['Url'];});
    items.forEach(function (event) {
        var idx = urls.indexOf(event['Url']);
        if (idx == -1) events.push(event);
        else events[idx] = event;
    });
    var result = events.sort(function (e1, e2) {
        return e1.Date.getTime() - e2.Date.getTime();
    });
    console.log("events2",result.length);
//	result.forEach(function (e) {
//		console.log(e.Date,e.Title,e.Location,e.Type,e.Origin)
//	})
	return result;
}

function wrap(prefix, value, suffix) {
    var str = "";
    if (value) {
        if (prefix) str = prefix;
        str += value.toString();
        if (suffix) str += suffix;
    }
    return str;
}

function parseEvents(cells, fun, filter) {
    var now = new Date();
    var header;
    var items = [];
    for (var rowNo in cells.cells) {
        var row = cells.cells[rowNo];
        if (!header) {
            header = row;
            continue;
        }
        var item = {};
        for (var colNo in row) {
            item[header[colNo].value] = row[colNo].value
        }
        if (new Date(item.Start) >= now && item.Created && item.Created.length > 0 && (!filter || filter(item))) {
            item.Title = wrap(item['Type'], " - ") + item['Title'] + wrap(" - ", item['City']);
            items.push(item);
        }
        item.Date = new Date(item.Start);
		item.Origin="Spreadsheet";
    }
    if (filter) fun(items.filter(filter));
    else fun(items)
}

function eventsFromSpreadSheet(fun, filter) {
    spreadsheet.load(process.env.EVENTS_SHEET_KEY, function (err, spreadsheet) {
        if (err) {
            console.log("Error retrieving spreadsheet ", err)
        }
        spreadsheet.worksheets[0].cells({
            range:"R1C1:R100C26"
        }, function (err, cells) {
            if (err) {
                console.log("Error retrieving spreadsheet ", err)
            }
            parseEvents(cells, fun, filter);
        });
    });
}

exports.add_events_route = function (path, app) {
    app.get(path, function (req, res) {
        var filter = req.query['filter'];
        events(function (items) {
            var data = JSON.stringify(items);
            res.send(200, data);
        }, function (item) {
            return !filter || item.title.match(filter) || item.summary.match(filter)
        })
    });
};


exports.init = function (app, interval) {
    function updateEvents() {
        events(function (items) {
            app.locals.events = items;
            console.log("events", app.locals.events.length);

            var mapping = {Meetup: "meetups",Webinar:"webinars",Conference:"conferences",Training:"trainings"};
            eventsFromSpreadSheet(function (items) {
                app.locals.events = mergeEvents(app.locals.events, items);
                app.locals.events.forEach(function (e) {
                    e.type = "event";
                    console.log(e.Type,mapping[e.Type]);
                    app.locals.pages[mapping[e.Type]].related.push(e);
                });
                //app.locals.pages.events.featured = ["graphconnect","trainings"].concat(app.locals.events.slice(0,4));
                app.locals.pages.events.related = ["meetups","webinars","trainings","conferences"].concat(app.locals.events);
                
            })
        })
    }
    spreadsheet.googleLogin(function () {
        updateEvents();
    });

    // regular updates
    setInterval(updateEvents, interval);
};

exports.events = events;
exports.eventsFromSpreadSheet = eventsFromSpreadSheet;
