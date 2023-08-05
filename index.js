const express = require("express");
const elasticsearch = require("elasticsearch");

const app = express();
const client = new elasticsearch.Client({
  hosts: ["http://elastic:f7xzcqmqiHdCvcAPt*M_@localhost:9200"],
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
