const express = require("express");
const elasticsearch = require("elasticsearch");
const mysql = require("mysql");

const app = express();
const client = new elasticsearch.Client({
  hosts: ["http://elastic:f7xzcqmqiHdCvcAPt*M_@localhost:9200"],
});

const con = mysql.createConnection({
  host: "leadquelle-master.cn6avsqv5zrn.eu-central-1.rds.amazonaws.com",
  user: "admin",
  password: "fZBdu5MDEmUa1Hv3FFTc",
  database: "regions_master",
});

app.post("/create_index", function (req, res) {
  client.indices.create(
    {
      index: "index_regions",
      body: {
        mappings: {
          properties: {
            name_suggest: { type: "completion" },
          },
        },
      },
    },
    function (err, resp, status) {
      if (err) {
        console.log(err);
      } else {
        console.log(resp);
        res.send("Index created with correct mapping");
      }
    }
  );
});

app.delete("/remove_index", function (req, res) {
  client.indices.delete(
    { index: "index_regions" },
    function (err, resp, status) {
      if (err) {
        console.log(err);
      } else {
        res.send("Index deleted");
      }
    }
  );
});

app.get("/search", function (req, res) {
  client.search(
    {
      index: "index_regions",
      body: {
        suggest: {
          regions_suggestor: {
            prefix: req.query.text,
            completion: {
              field: "name_suggest",
            },
          },
        },
      },
    },
    function (error, response, status) {
      if (error) {
        console.log("search error: " + error);
      } else {
        res.send(response);
      }
    }
  );
});

app.listen(3000, function () {
  console.log("Example app listening on port 3000!");
});
