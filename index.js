var express = require('express');
var morgan = require('morgan');
var path = require('path');
var mysql=require('mysql');
var crypto = require('crypto');
var bodyParser = require('body-parser');
var session = require('express-session');

var pool = mysql.createConnection({
    user: 'root',
    host: 'localhost',
    database: 'imad_app',
    port: '3306',
    password: 'process.env.DATABASE_PASSWORD'
});

var app = express();
app.use(morgan('combined'));
app.use(bodyParser.json());
app.use(session({
    secret: 'SomeRandomSecretValue',
    cookie: { maxAge: 1000*60*60*24*30 }
}));

function createTemplate (data) {
    var title=data.title;
    var date= data.date;
    var heading = data.heading;
    var content = data.content;

var HTMLtemplate=
`
<html>
   <head>
       <title>
           ${title}
       </title>
       <meta name="viewport" content="width=device-width, initial-scale=1" />
       <link href="/ui/style.css" rel="stylesheet" />
   </head>
   <body>
       <div class="container">
           <div>
               <a href="/">Home</a>
           </div>
           <hr/>
           <h3>
               ${heading}
           </h3>
           <div>
               ${date.toDateString()}
           </div>
           <div>
             ${content}
           </div>
           <hr/>
           <h4>Comments</h4>
           <div id="comment_form">
           </div>
           <div id="comments">
             <center>Loading comments...</center>
           </div>
       </div>
       <script type="text/javascript" src="/ui/article.js"></script>
   </body>
 </html>`;
return HTMLtemplate;
}

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'ui', 'index.html'));
});

function hash (input, salt) {
    var hashed = crypto.pbkdf2Sync(input, salt, 10000, 512, 'sha512');
    return ["pbkdf2", "10000", salt, hashed.toString('hex')].join('$');
}

app.get('/hash/:input', function(req,res) {
    var hashedString=hash(req.params.input, 'random-string');
    res.send(hashedString);
});

app.post('/create-user', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    var salt = crypto.randomBytes(128).toString('hex');
    var dbString=hash(password, salt);
    pool.query("INSERT INTO `user`(`username`,`password`) VALUES ('"+req.body.username+"','"+dbString+"')", function(err, field, result) {
        if(err) {
            res.status(500).send(err.toString());
        }
        else {
            res.send({});
        }
    });
});

app.post('/login', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    pool.query("SELECT * FROM `user` WHERE `username` = '"+req.body.username+"' ", function(err, result, field) {
        if(err) {
            res.status(500).send({});
        } else {
            if(result.length === 0) {
                res.status(500).send(JSON.stringify({ error: "Invalid username/password"}));
            }
            else{
                 var dbString = result[0].password;
                 var salt = dbString.split('$')[2];
                 var hashedPassword = hash(password, salt);
                 if(hashedPassword === dbString) {
                     req.session.auth = {userId: result[0].id};
                     res.send(JSON.stringify({ message: "Credentials correct!"}));
                   } else{
                     res.status(403).send(JSON.stringify({ error: "Invalid username/password"}));
                   }
                 }
        }

    });
});
app.get('/check-login', function (req, res) {
   if (req.session && req.session.auth && req.session.auth.userId) {
       var id=req.session.auth.userId;
       res.send("You are logged in: "+req.session.auth.userId);
   } else {
       res.status(400).send('You are not logged in.');
   }
});

app.get('/logout', function(req, res) {
    delete req.session.auth;
    res.send('You have logged out.<br><a href="/">Home</a>');
});

app.get('/get-articles', function (req, res) {
   // make a select request
   // return a response with the results
   pool.query('SELECT * FROM article', function (err, result) {
      if (err) {
          res.status(500).send(err.toString());
      } else {
          res.send(JSON.stringify(result));
      }
   });
});

app.get('/get-comments/:articleName', function (req, res) {
   // make a select request
   // return a response with the results
   pool.query("SELECT comment.*, user.`username` FROM article, comment, user WHERE article.`title` = ? AND article.`id` = comment.`article_id` AND comment.`user_id` = user.`id` ORDER BY comment.`timestamp` DESC", [req.params.articleName], function (err, result) {
      if (err) {
          res.status(500).send(err.toString());
      } else {
          res.send(JSON.stringify(result));
      }
   });
});

app.post('/submit-comment/:articleName', function (req, res) {
   // Check if the user is logged in
    if (req.session && req.session.auth && req.session.auth.userId) {
        // First check if the article exists and get the article-id
        pool.query('SELECT * from article where title = ?', [req.params.articleName], function (err, result) {
            if (err) {
                res.status(500).send(err.toString());
            } else {
                if (result.length === 0) {
                    res.status(400).send('Article not found');
                } else {
                    var articleId = result[0].id;
                    // Now insert the right comment for this article
                    pool.query(
                        "INSERT INTO comment (comment, article_id, user_id) VALUES (?, ?, ?)",
                        [req.body.comment, articleId, req.session.auth.userId],
                        function (err, result) {
                            if (err) {
                                res.status(500).send(err.toString());
                            } else {
                                res.status(200).send('Comment inserted!')
                            }
                        });
                }
            }
       });
    } else {
        res.status(403).send('Only logged in users can comment');
    }
});


app.get('/test-db', function(req,res) {
  var usertest='EpicThunder';
  pool.query("SELECT * FROM `user` WHERE `username`='"+usertest+"'", function (err, result, fields) {
    if(err) {
      res.send('error');
    }
    res.send(result);
  });
});

var counter=0;
app.get('/counter', function (req,res) {
    counter = counter + 1;
    res.send(counter.toString());
});

var names=[];
app.get('/submit-name', function(req,res) {
    //Get the name for the request

    var name = req.query.name;

    names.push(name);

    res.send(JSON.stringify(names));
});


app.get('/articles/:ArticleName',function (req, res) {
  console.log(req.params.ArticleName);
    pool.query("SELECT * FROM article WHERE title = ?",[req.params.ArticleName], function(err, result) {
        if(err) {
            res.status(500).send(err.toString());
        }
        else{
            if(result.length === 0) {
                res.status(404).send('Article not found');
            }
            else {
                var articleData= result[0];
                res.send(createTemplate(articleData));
            }
        }
    });
});

app.get('/ui/style.css', function (req, res) {
  res.sendFile(path.join(__dirname, 'ui', 'style.css'));
});

app.get('/ui/main.js', function (req, res) {
  res.sendFile(path.join(__dirname, 'ui', 'main.js'));
});

app.get('/ui/article.js', function (req, res) {
  res.sendFile(path.join(__dirname, 'ui', 'article.js'));
});

app.get('/ui/madi.png', function (req, res) {
  res.sendFile(path.join(__dirname, 'ui', 'madi.png'));
});


// Do not change port, otherwise your app won't run on IMAD servers
// Use 8080 only for local development if you already have apache running on 80
pool.connect(function(err) {
  if (err) {
    console.log("Error in connecting to MySQL Database");
    console.log(err);
  } else {
  console.log("Connected!");
}
});

var port = 8080;
app.listen(port, function () {
  console.log(`App listening on port ${port}!`);
});
