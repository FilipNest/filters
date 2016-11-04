var Datastore = require('nedb');
var Handlebars = require('handlebars');
var moment = require("moment");

var db = new Datastore({
  filename: 'words.db',
  autoload: true
});

var util = require("util");

var debug = function (thing) {

  console.log(util.inspect(thing, {
    depth: 10
  }))

}

var server = require('http').createServer(),
  WebSocketServer = require('ws').Server,
  wss = new WebSocketServer({
    server: server
  }),
  express = require('express'),
  app = express(),
  bodyParser = require('body-parser'),
  port = 80;

app.use(bodyParser.urlencoded({
  extended: false
}));

app.use(bodyParser.json());

var session = require('express-session');

app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));

var Hashids = require('hashids');
var hashids = new Hashids();

app.use(function (req, res, next) {

  if (!req.session.user) {

    req.session.user = hashids.encode(Date.now());

  }

  next();

});

app.use(express.static('static'));

var fs = require("fs");

var messagesFromTags = function (tags) {

  return new Promise(function (resolve, reject) {

    var search;

    if (!tags || tags === "") {

      search = {};

    } else {

      var parsedTags = tags.split(",");

      var positive = [];
      var negative = [];

      parsedTags.forEach(function (tag) {

        // Check if first character is exclamation point, therefore negate

        if (tag[0] === "!") {

          negative.push(tag.substring(1));

        } else {

          positive.push(tag);

        }

        search = {
          "$and": [],
          "$not": []
        };

        positive.forEach(function (item) {

          search["$and"].push({
            tags: {
              $elemMatch: item
            }
          })

        })

        negative.forEach(function (item) {

          search["$not"].push({
            tags: {
              $elemMatch: item
            }
          })

        })

      });

    }
    
    db.find(search).sort({
      date: -1
    }).exec(function (err, messages) {

      messages.forEach(function (message) {

        message.date = moment(message.date).format("ddd, hA");

      });

      messages.reverse();

      resolve(messages);

    });

  })

};

app.get("/:tags?", function (req, res) {

  var templateFile = fs.readFileSync(__dirname + "/index.html", "utf8");
  var messagesTemplateFile = fs.readFileSync(__dirname + "/messages.html", "utf8");

  var template = Handlebars.compile(templateFile);
  var messagesTemplate = Handlebars.compile(messagesTemplateFile);

  messagesFromTags(req.params.tags).then(function (messages) {

    var output = template({
      tagsJSON: req.params.tags,
      tags: req.params.tags ? req.params.tags.split(",") : null
    });

    var messageBlock = messagesTemplate({
      messages: messages,
    });

    output = output.replace("MESSAGES", messageBlock);

    res.send(output);

  })

});

app.get("/meta/refresh/:tags?", function (req, res) {

  messagesFromTags(req.params.tags).then(function (messages) {

    var messagesTemplateFile = fs.readFileSync(__dirname + "/messages.html", "utf8");

    var messagesTemplate = Handlebars.compile(messagesTemplateFile);

    var messageBlock = messagesTemplate({
      messages: messages,
    });

    res.send(messageBlock);

  })

})

var messageCount = 0;

app.post("/:tags?", function (req, res) {

  var post = req.body;

  if (req.body.words && typeof req.body.words === "string" && req.body.words.length < 500) {

    var tags = req.body.tags.split(",");

    var message = {
      words: req.body.words,
      author: req.session.user,
      id: hashids.encode(messageCount),
      date: Date.now(),
      tags: tags
    };

    db.insert(message, function (err, newDoc) {

      messageCount += 1;

      if (!req.params.tags) {

        req.params.tags = "";

      }

      res.redirect("/" + req.params.tags);

    });

  } else {

    res.status(400).send("Bad message");

  }

});

wss.on('connection', function (ws) {

  ws.on('message', function (message) {
    console.log('received: %s', message);
  });

  ws.send('something');

});

server.on('request', app);

server.listen(port);
