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

const createIndexIfNotExists = async () => {
  const indexExists = await client.indices.exists({ index: "index_regions" });
  if (!indexExists) {
    await client.indices.create({
      index: "index_regions",
      body: {
        mappings: {
          properties: {
            name_suggest: { type: "completion" },
          },
        },
      },
    });
    console.log("Index created");
  } else {
    console.log("Index already exists");
  }
};

const queryAndIndexData = async () => {
  return new Promise((resolve, reject) => {
    con.connect((err) => {
      if (err) reject(err);
      con.query("SELECT * FROM regions", async (err, result) => {
        if (err) reject(err);
        for (const row of result) {
          const resp = await client.index({
            index: "index_regions",
            body: {
              name_suggest: row.name,
              country_code: row.country_code,
            },
          });
          console.log(`Indexed row: ${JSON.stringify(row)}, Response: ${JSON.stringify(resp)}`);
        }
        resolve("Indexing completed");
      });
    });
  });
};

app.post("/index", async (req, res) => {
  try {
    await createIndexIfNotExists();
    const message = await queryAndIndexData();
    res.send(message);
  } catch (error) {
    console.error(`An error occurred: ${error}`);
    res.status(500).send("Internal Server Error");
  }
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
  // Parse the countries query parameter into an array
  const countries = req.query.countries ? req.query.countries.split(",") : [];

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
        res.status(500).send(error);
      } else {
        // Post-process to filter by country_code
        const filteredSuggestions = response.suggest.regions_suggestor[0].options.filter(option => {
          return countries.includes(option._source.country_code);
        });

        res.send({ suggest: { regions_suggestor: [ { options: filteredSuggestions } ] } });
      }
    }
  );
});
app.listen(3000, function () {
  console.log("Example app listening on port 3000!");
});
