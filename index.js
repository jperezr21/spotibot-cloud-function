'use strict';

const SpotifyWebApi = require('spotify-web-api-node');
const Datastore = require('@google-cloud/datastore');

const projectId = 'newagent-6f7b4';
const accessTokensDatastoreKind = 'spotifyAccessTokens';
const spotifyCredentialsDatastoreKind = 'spotifyCredentials';
const spotifyListSongDatastoreKind = 'userListSongs';
const authenticatedActions = ['PlaySong', 'Login', 'Logout', 'ChooseSong'];
const spotifyActions = ['PlaySong', 'ChooseSong']

/**
 * Responds to any HTTP request that can provide a "message" field in the body.
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */
exports.fulfillmentHandler = (req, res) => {
  console.log(JSON.stringify(req.body));
  var intent = req.body.queryResult.intent.displayName;
  console.log('intent es: ', intent);
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
                case 'ChooseSong':
                  handlePlayUriSong(req, res, spotifyApi);
                  break;
                default:
                  sendResponse(res, 'Intent not implemented');
              }
            });
        }
      }
    });
  } else {
    sendResponse(res, 'Intent not implemented');
    // TODO non-authenticated actions
  }
};

function handleLogin(res, userId) {
  var mensajes = [{
    "card": {
      "title": "Sesión",
      "subtitle": "Debes iniciar sesión en Spotify",
      "buttons": [{
        "text": "Iniciar Sesión",
        "postback": "https://newagent-6f7b4.appspot.com/login?user_id=" + userId,
      }]
    }
  }]
  res.json({
    "fulfillmentMessages": mensajes
  });
  /*sendResponse(res,
    `Entra al siguiente link: ` +
    `https://newagent-6f7b4.appspot.com/login?user_id=${userId}`); */
}

function handleLogout(res, userId) {
  deleteDatastoreItem(accessTokensDatastoreKind, userId).then(() =>
    sendResponse(res, 'Sesión cerrada correctamente')
  );
}

function handlePlayUriSong(req, res, spotifyApi) {
  console.log('entrando en reproducir lista...');

  var ds = Datastore({
    projectId: projectId
  });

  // obtengo cancion asociada
  var key = ds.key([spotifyListSongDatastoreKind, getUserIdFromRequestData(req.body)]);
  ds.get(key, (err, entity) => {
    if (!err) {
      if (entity) {
        console.log('registro es: ', entity);
        // encontro registro con canciones
        var lista = entity.songs;
        var cancionElegida = req.body.queryResult.parameters.number;
        console.log('lista: ', lista);
        console.log('elegida: ', cancionElegida);
        var song = lista[cancionElegida - 1];
        var songUri = song.songUri;
        var songInfo = song.info;
        console.log('song uri: ', songUri);
        spotifyApi.play({
          "uris": [songUri]
        }).then(() =>
          sendResponse(res, "Reproduciendo " + songInfo)
        );

      } else {
        console.log('no se encontro registro');
      }
    } else {
      // error general
      console.log('error general');
    }
  })
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
  console.log('antes de buscar...');
  spotifyApi.searchTracks(query)
    .then(function(data) {
      console.log(JSON.stringify(data.body));
      var items = data.body.tracks.items;
      if (items.length > 0) {
        // si hay solo 1 reproduzco esa
        if (items.length == 1) {
          spotifyApi.play({
            "uris": [items[0].uri]
          }).then(() =>
            sendResponse(res, "Reproduciendo " + items[0].name + " de " + items[0].artists[0].name)
          );
        } else {
          var botonesCancion = [];
          var listaUris = [];
          var cantidad;
          if (items.length > 8) {
            cantidad = 8;
          } else {
            cantidad = items.length;
          }
          console.log('entrando al for...');
          for (var i = 0; i < cantidad; i++) {
            var songUri = items[i].uri;
            var songName = items[i].name;
            var info = "";
            var artistas = "";
            for (var j = 0; j < items[i].artists.length; j++) {
              artistas = artistas + " " + items[i].artists[j].name;
            }
            info = songName + " de " + artistas;
            var obj = {
              "text": (i + 1) + " " + info
            };
            botonesCancion.push(obj);

            listaUris.push({
              "songUri": songUri,
              "info": info
            });
          }
          console.log('saliendo del for...');
          console.log('botones son: ', botonesCancion);
          var mensajes = [{
            "card": {
              "title": "Canciones disponibles",
              "buttons": botonesCancion
            }
          }];

          saveDatastoreItem({
            "userId": getUserIdFromRequestData(req.body),
            "songs": listaUris
          });
          // no se puede guardar en contexto anda a saber
          //res.json({"fulfillmentMessages": mensajes, "outputContexts":[{"name":"projects/${PROJECT_ID}/agent/sessions/${SESSION_ID}/contexts/context listauris", "lifespanCount":5, "parameters":{"listaUris":listaUris}}] });
          res.json({
            "fulfillmentMessages": mensajes
          });
        }
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

function saveDatastoreItem(value) {
  console.log('guardando canciones...: ', value);
  var ds = Datastore({
    projectId: projectId
  });

  // pregunto si existe en bd esa key
  var key = ds.key([spotifyListSongDatastoreKind, value.userId]);
  ds.get(key, (err, entity) => {
    if (!err) {
      // no error guardo en bd
      var key = ds.key([spotifyListSongDatastoreKind, value.userId]);
      var entity = {
        key: key,
        data: [{
          "name": "songs",
          "value": value.songs
        }]
      };

      ds.save(
        entity,
        (err) => {
          if (!err) {
            console.log('canciones guardadas: ', value);
          } else {
            console.log('error al guardar');
          }
        }
      );
    } else {
      // error general
      console.log('error general');
    }

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