const boxSDK = require('box-node-sdk');   // Box SDK
const clarifai = require('clarifai');     // Clarifai SDK
const config = require('./config.js');    // Keys and config
const util = require('util');             // Deep inspection of objects

let indexerCallback;
let indexerEvent;

/**
 * Process an incoming event
 *
 * @return {callback} lambda callback
 */
const processEvent = () => {
  // Capture file ID and tokens from Box event
  const { queryStringParameters, body } = indexerEvent;
  const { source, token, id } = JSON.parse(body);
  const fileId = source.id;
  let readToken = token.read.access_token;
  let writeToken = token.write.access_token;

  // Create new Box SDK instance
  const sdk = new boxSDK({
    clientID: config.boxClientId,
    clientSecret: config.boxClientSecret
  });
  let client = sdk.getBasicClient(writeToken);

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
            message: 'Categories'
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

      // Update Box metadata
      client.files.addMetadata(fileId, client.metadata.scopes.GLOBAL, metadataTemplate, metadata).then((err, metadata) => {
        console.log("ADDING----------------------------------------------------------------");
      }).catch(function (err) {
        if (err.response && err.response.body && err.response.body.code === 'tuple_already_exists') {
          console.log("CONFLICT----------------------------------------------------------------");

          const jsonPatch = [{ op: 'replace', path: '/cards/0', value: metadata.cards[0] }];

          client.files.updateMetadata(fileId, client.metadata.scopes.GLOBAL, metadataTemplate, jsonPatch).then((err, metadata) => {
            console.log("UPDATED----------------------------------------------------------------");
          }).catch(function (err) {
            console.log(err.response.body);
          });
        } else {
          console.log(err.response.body);
        }
      });
    },
    function(err) {
      console.error(err);
    }
  );
};

/**
 * This is the main function that the Lambda will call when invoked.
 * @return {boolean} - true if valid event
 */
const isValidEvent = () => {
  return (indexerEvent.body);
};

/**
 * This is the main function that the Lamba will call when invoked.
 *
 * @param {webhooksEvent} event - data from the event, including the payload of the webhook, that triggered this function call
 * @param {context}   context - additional context information from the request (unused in this example)
 * @param {callback}  callback - the function to call back to once finished
 * @return {callback} lambda callback
 */
exports.handler = (event, context, callback) => {
  // Set indexer information
  indexerCallback = callback;
  indexerEvent = event;

  if (isValidEvent()) {
    processEvent();
  } else {
    callback(null, { statusCode: 200, body: 'Event received but invalid' });
  }
};