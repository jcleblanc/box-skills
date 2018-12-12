const axios = require('axios');           // HTTP lib
const bodyParser = require('body-parser') // Body Parser for JSON encoded bodies
const clarifai = require('clarifai');     // Clarifai SDK
const config = require('./config.js')     // Keys and config
const express = require('express')();     // Express
const http = require('http');             // HTTP server
const util = require('util');             // Deep inspection of objects

express.use(bodyParser.json());
express.use(bodyParser.urlencoded({
  extended: true
})); 

express.post('/', (req, res) => {
  // Capture file ID and tokens from Box event
  let body = req.body;
  let fileId = body.source.id;
  let readToken = body.token.read.access_token;
  let writeToken = body.token.write.access_token;
  
  // Instantiate a new Clarifai app instance
  const app = new clarifai.App({
    apiKey: config.clarifaiKey
  });

  // Create shared link to the file with write token
  const fileURL = `https://api.box.com/2.0/files/${fileId}/content?access_token=${readToken}`;

  // predict the contents of an image by passing in a url
  app.models.predict(clarifai.GENERAL_MODEL, fileURL).then(
    function(response) {
      // Capture all categories
      let entries = [];
      for (let category of response.outputs[0].data.concepts) {
        if (category.value > 0.9) {
          entries.push({ type: 'text', text: category.name });
        }
      }

      // Set Box metadata template information
      const metadataTemplate = 'boxSkillsCards';
      const metadata = { 
        cards: [{
          created_at: new Date().toISOString(),
          type: 'skill_card',
          skill_card_type: 'keyword',
          skill_card_title: {
            message: 'Categories2'
          },
          skill: {
            type: 'service',
            id: 'jleblanc-clarifai-heroku'
          },
          invocation: {
            type: 'skill_invocation',
            id: fileId
          },
          entries: entries
        }]};

        // Set metadata add / update URL
        const urlMetadata = `https://api.box.com/2.0/files/${fileId}/metadata/global/${metadataTemplate}`;

        // Create POST request headers
        let config = {
          headers: {
            'Authorization': `Bearer ${writeToken}`,
            'Content-Type': 'application/json' 
          }
        };

        // Make request to add metadata to file
        axios.post(urlMetadata, metadata, config).then(function (response) {
          console.log('Metadata added');
        })
        .catch(function (error) {
          // If metadata already exists on the file this error will trigger
          if (error.response.data.code === 'tuple_already_exists') {
            // Modify headers for JSON patch metadata update request
            config.headers = {
              'Authorization': `Bearer ${writeToken}`,
              'Content-Type': 'application/json-patch+json' 
            };

            // Create JSON patch data
            const jsonPatch = [{ op: 'replace', path: '/cards/0', value: metadata.cards[0] }];

            // Make Metadata update JSON patch request
            axios.put(urlMetadata, jsonPatch, config).then(function (response) {
              console.log('Metadata added');
            }).catch(function (error) {
              console.log(error);
              console.log('Metadata update failed');
            });
          } else {
            console.log(error.response.data.code);
          }
        });
      },
      function(err) {
        console.error(err);
      }
    );
});

// Create server
const port = process.env.PORT || 3000;
http.createServer(express).listen(port, () => {
  console.log(`Server started: Listening on port ${port}`);
});
