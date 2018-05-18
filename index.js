'use strict';

const SpotifyWebApi = require('spotify-web-api-node');
const Datastore = require('@google-cloud/datastore');

const projectId = 'newagent-6f7b4';
const accessTokensDatastoreKind = 'spotifyAccessTokens';
const spotifyCredentialsDatastoreKind = 'spotifyCredentials';
const authenticatedActions = ['PlaySong', 'Login', 'Logout'];
const spotifyActions = ['PlaySong']

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
      console.log('accessToken @ 25: ' + accessToken);
      if (!accessToken || intent == 'Login') {
        handleLogin(res, userId);
      } else if (intent == 'Logout') {
        handleLogout(res, userId);
      } else {
        if (spotifyActions.includes(intent)) {
          getSpotifyCredentials().then(
            spotifyCredentials => {
              console.log('spotifyCredentials: ' + JSON.stringify(spotifyCredentials));
              var spotifyApi = new SpotifyWebApi({
                clientId: spotifyCredentials.clientId,
                clientSecret: spotifyCredentials.clientSecret
              });
              spotifyApi.setAccessToken(accessToken);
              switch (intent) {
                case 'PlaySong':
                  handlePlaySong(req, res, spotifyApi);
                  break;
                default:
                  sendResponse(res, 'Intent not implemented');
              }
            });
        }
      }
    });
  } else {
    // TODO non-authenticated actions
  }
};

function handleLogin(res, userId) {
    var mensajes = [
    {
      "card": {
        "title": "Sesión",
        "subtitle": "Debes iniciar sesión en Spotify",
        "buttons": [
          {
            "text": "Iniciar Sesión",
            "postback": "https://newagent-6f7b4.appspot.com/login?user_id="+userId,
          }
        ]
      }
    }
  ]
  res.json({"fulfillmentMessages": mensajes});
  /*sendResponse(res,
    `Entra al siguiente link: ` +
    `https://newagent-6f7b4.appspot.com/login?user_id=${userId}`); */
}

function handleLogout(res, userId) {
  deleteDatastoreItem(accessTokensDatastoreKind, userId).then(() =>
    sendResponse(res, 'Sesión cerrada correctamente')
  );
}

function handlePlaySong(req, res, spotifyApi) {
  var songName = req.body.queryResult.parameters.songName;
  var artist = req.body.queryResult.parameters.artist;
  var query;
  if (artist) {
    query = `track:${songName} artist:${artist}`;
  } else {
    query = songName;
  }
  spotifyApi.searchTracks(query)
    .then(function(data) {
      var items = data.body.tracks.items
      if (items.length > 0) {
        var songUri = items[0].uri;
        var songName = items[0].name;
        var artist = items[0].artists[0].name;
        console.log(`Search tracks by "${songName}" in the track name and "${artist}" in the artist name`);
        console.log(JSON.stringify(data.body));
        spotifyApi.play({
          "uris": [songUri]
        }).then(() =>
          sendResponse(res, `Reproduciendo "${songName}" de ${artist}`)
        );
      } else {
        sendResponse(res, `Lo siento, no he encontrado esa canción`)
      }
    }, function(err) {
      console.log('Something went wrong!', err);
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

function deleteDatastoreItem(kind, key) {
  var datastore = Datastore({
    projectId: projectId
  });
  var key = datastore.key([kind, key]);
  return datastore.delete(key).then(() => {
    console.log(`Deleted user ${key}`);
  });
}

function getUserIdFromRequestData(requestData) {
  var payload = requestData.originalDetectIntentRequest.payload;
  switch (payload.source) {
    case 'slack_testbot':
      return 'slack-' + payload.data.user;
      break;
    case 'skype':
      return 'skype-' + payload.data.address.user.id;
      break;
    case 'telegram':
      return 'telegram-' + payload.data.message.from.id;
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
