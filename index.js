const express = require("express");
const elasticsearch = require("elasticsearch");
const mysql = require("mysql");
const AWS = require("aws-sdk");

const app = express();

let con, client, esPassword;

const secretsManager = new AWS.SecretsManager({
  region: "eu-central-1",
});

secretsManager.getSecretValue(
  { SecretId: "LeadquelleMasterRDSDatabaseInstance" },
  (err, data) => {
    if (err) {
      console.error(err);
    } else {
      const secret = JSON.parse(data.SecretString);

      con = mysql.createConnection({
        host: secret.host,
        user: secret.username,
        password: secret.password,
        database: "regions_master",
      });
    }
  }
);

secretsManager.getSecretValue({ SecretId: "es_secret" }, (err, data) => {
  if (err) {
    console.error(err);
  } else {
    const secret = JSON.parse(data.SecretString);

    esPassword = secret.password;

    client = new elasticsearch.Client({
      hosts: [`http://elastic:${esPassword.trim()}@localhost:9200`],
    });
  }
});

app.post("/index", function (req, res) {
  client.indices.exists({ index: "index_regions" }, (err, resp, status) => {
    if (err) {
      console.log(err);
    } else if (!resp) {
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
          }
        }
      );
    }
  });

  con.connect(function (err) {
    if (err) throw err;
    con.query("SELECT * FROM regions", function (err, result) {
      if (err) throw err;
      result.forEach((row) => {
        client.index(
          {
            index: "index_regions",
            body: {
              name_suggest: row.name,
            },
          },
          function (err, resp, status) {
            console.log(resp);
          }
        );
      });
      res.send("Indexing completed");
    });
  });
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
            prefix: req.query.region,
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
