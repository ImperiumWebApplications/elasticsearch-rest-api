const express = require("express");
const elasticsearch = require("elasticsearch");

const app = express();
const client = new elasticsearch.Client({
  hosts: [
    {
      protocol: "http",
      host: "127.0.0.1",
      port: 9200,
      auth: {
        username: "elastic",
        password: " f7xzcqmqiHdCvcAPt*M_",
      },
    },
  ],
});

app.get("/search", function (req, res) {
  client.search(
    {
      index: "index_regions",
      body: {
        suggest: {
          text: req.query.text,
          completion: {
            field: "name",
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
