'use strict';

const SpotifyWebApi = require('spotify-web-api-node');
const Datastore = require('@google-cloud/datastore');

const projectId = 'newagent-6f7b4';
const accessTokensDatastoreKind = 'spotifyAccessTokens';
const spotifyCredentialsDatastoreKind = 'spotifyCredentials';
const authenticatedActions = ['PlaySong', 'Login'];

/**
 * Responds to any HTTP request that can provide a "message" field in the body.
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */
exports.fulfillmentHandler = (req, res) => {
  console.log(JSON.stringify(req.body));
  var intent = req.body.queryResult.intent.displayName;
  if (authenticatedActions.includes(intent)) {
    var userId = getUserIdFromRequestData(req.body);
    console.log('userId: ' + userId);
    getUserAccessToken(userId).then(accessToken => {
      console.log('accessToken @ 23: ' + accessToken);
      if (!accessToken || intent == 'Login') {
        handleLogin(res, userId);
      } else {
        switch (intent) {
          case 'PlaySong':
            handlePlaySong(req, res, accessToken);
            break;
          default:
            sendResponse(res, 'Intent not implemented');
        }
      }
    });
  } else {
    // TODO non-authenticated actions
  }
};

function handleLogin(res, userId) {
  sendResponse(res,
    `Entra al siguiente link: ` +
    `https://newagent-6f7b4.appspot.com/login?user_id=${userId}`);
}

function handlePlaySong(req, res, accessToken) {
  getSpotifyCredentials().then(
    spotifyCredentials => {
      console.log('spotifyCredentials: ' + JSON.stringify(spotifyCredentials));
      var spotifyApi = new SpotifyWebApi({
        clientId: spotifyCredentials.clientId,
        clientSecret: spotifyCredentials.clientSecret
      });
      spotifyApi.setAccessToken(accessToken);
      spotifyApi.play();
      sendResponse(res, "Ok");
    });
}

function getSpotifyCredentials() {
  return getDatastoreItem(spotifyCredentialsDatastoreKind, 'default');
}

function getUserAccessToken(userId) {
  return getDatastoreItem(accessTokensDatastoreKind, userId)
    .then(item => {
      if (item) {
        console.log('accessToken: ' + item.accessToken);
        return item.accessToken;
      } else {
        return '';
      }
    });
}

function getDatastoreItem(kind, key) {
  var datastore = Datastore({
    projectId: projectId
  });
  var key = datastore.key([kind, key]);
  return datastore.get(key).then(([item]) => {
    console.log('datastore item: ' + JSON.stringify(item));
    return item;
  });
}

function getUserIdFromRequestData(requestData) {
  var payload = requestData.originalDetectIntentRequest.payload;
  switch (payload.source) {
    case 'slack_testbot':
      return payload.data.user;
      break;
    case 'skype':
      return payload.data.address.user.id;
      break;
    case 'telegram':
      return payload.data.message.from.id;
      break;
    default:
      return 'default';
  }
}

function sendResponse(res, responseText) {
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify({
    "fulfillmentText": responseText
  }));
}
