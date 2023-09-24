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
            id: row.id,
            body: {
              name_suggest: row.name,
              country_code: row.country_code,
            },
          });
          console.log(
            `Indexed row: ${JSON.stringify(row)}, Response: ${JSON.stringify(
              resp
            )}`
          );
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

app.delete("/remove_index", async (req, res) => {
  try {
    const resp = await client.indices.delete({ index: "index_regions" });
    console.log(`Response from delete operation: ${JSON.stringify(resp)}`);
    res.send("Index deleted");
  } catch (err) {
    console.log(`Error occurred while deleting index: ${err}`);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/search", async (req, res) => {
  try {
    // Parse the countries query parameter into an array
    const countries = req.query.countries ? req.query.countries.split(",") : [];

    const response = await client.search({
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
    });

    // Post-process to filter by country_code
    const filteredSuggestions =
      response.suggest.regions_suggestor[0].options.filter((option) => {
        return countries.includes(option._source.country_code);
      });

    res.send({
      suggest: { regions_suggestor: [{ options: filteredSuggestions }] },
    });
  } catch (error) {
    console.log(`Search error: ${error}`);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(3000, function () {
  console.log("Example app listening on port 3000!");
});
