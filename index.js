'use strict';

const SpotifyWebApi = require('spotify-web-api-node');
const Datastore = require('@google-cloud/datastore');
var request = require('ajax-request');
const projectId = 'newagent-6f7b4';
const accessTokensDatastoreKind = 'spotifyAccessTokens';
const refreshTokensDatastoreKind = 'spotifyRefreshTokens';
const spotifyCredentialsDatastoreKind = 'spotifyCredentials';
const spotifyListSongDatastoreKind = 'userListSongs';
const authenticatedActions = [
  'Play',
  'Pause',
  'PlaySong',
  'PlayArtist',
  'PlayPlaylistArtist',
  'Logout',
  'ChooseSong',
  'PlayAlbum',
  'PlayFavourite',
  'PlayPrevious',
  'PlayNext',
  'PlaySong-more',
  'PlaySong-more-next'
];
const spotifyActions = [
  'Play',
  'Pause',
  'PlaySong',
  'PlayArtist',
  'PlayPlaylistArtist',
  'ChooseSong',
  'PlayAlbum',
  'PlayFavourite',
  'PlayPrevious',
  'PlayNext',
  'PlaySong-more',
  'PlaySong-more-next'
];

/**
 * Responds to any HTTP request that can provide a "message" field in the body.
 *
 * @param {!Object} req Cloud Function request context.
 * @param {!Object} res Cloud Function response context.
 */
exports.fulfillmentHandler = (req, res) => {
  var intent = req.body.queryResult.intent.displayName;
  if (authenticatedActions.includes(intent)) {
    var userId = getUserIdFromRequestData(req.body);
    getUserAccessToken(userId).then(accessToken => {
      getUserRefreshToken(userId).then(refreshToken => {
        if (!accessToken || intent == 'Login') {
          handleLogin(res, userId);
        } else if (intent === 'Logout') {
          handleLogout(req, res, userId);
        } else {
          if (spotifyActions.includes(intent)) {
            getSpotifyCredentials().then(spotifyCredentials => {
              var spotifyApi = new SpotifyWebApi({clientId: spotifyCredentials.clientId, clientSecret: spotifyCredentials.clientSecret});
              spotifyApi.setAccessToken(accessToken);
              spotifyApi.setRefreshToken(refreshToken);
              // valido y si es necesario refresco token, si da false, hay que hacer login
              refrescarToken(userId, spotifyApi).then(function (valido) {
                if (valido) {
                  switch (intent) {
                    case 'PlaySong':
                      handlePlaySong(req, res, spotifyApi);
                      break;
                    case 'ChooseSong':
                      handlePlayUriSong(req, res, spotifyApi);
                      break;
                    case 'PlayArtist':
                      var songName = req.body.queryResult.parameters.songName;
                      var artist = req.body.queryResult.parameters.artist;
                      handlePlaySong(songName, artist, req, res, spotifyApi);
                      break;
                    case 'PlayPlaylistArtist':
                      handlePlayPlaylistArtist(req, res, spotifyApi);
                      break;
                    case 'Play':
                      handlePlay(req, res, spotifyApi);
                      break;
                    case 'Pause':
                      handlePause(req, res, spotifyApi);
                      break;
                    case 'PlayAlbum':
                      handlePlayAlbum(req, res, spotifyApi);
                      break;
                    case 'PlayFavourite':
                      handlePlayFavourite(req, res, spotifyApi);
                      break;
                    case 'PlayPrevious':
                      handlePrevious(req, res, spotifyApi);
                      break;
                    case 'PlayNext':
                      handleNext(req, res, spotifyApi);
                      break;
                    case 'PlaySong-more':
                      handleMoreInfo(req, res, spotifyApi);
                      break;
                    case 'PlaySong-more-next':
                      handleMoreSongs(req, res, spotifyApi);
                      break;
                    default:
                      sendResponse(res, 'Intent not implemented');
                  }
                } else {
                  handleLogin(res, userId);
                }
              });

            });
          }
        }
      });
    });
  } else {
    switch (intent) {
      case 'Default Welcome Intent':
        handleWelcome(req, res);
        break;
      default:
        sendResponse(res, 'Intent not implemented');
    }
  }
};

function handleWelcome(req, res) {
  const name = getUserNameFromRequestData(req.body);
  sendResponse(res, 'Bienvenido/a ' + name + '!');
}

function handleLogin(res, userId) {
  const mensajes = [{
    "card": {
      "title": "Sesión",
      "subtitle": "Debes iniciar sesión en Spotify",
      "buttons": [{
        "text": "Iniciar Sesión",
        "postback": "https://newagent-6f7b4.appspot.com/login?user_id=" + userId
      }]
    }
  }];
  res.json({"fulfillmentMessages": mensajes});
  return;
}

function handleLogout(req, res, userId) {
  deleteDatastoreItem(accessTokensDatastoreKind, userId)
    .then(() =>
      sendResponse(res, ' Para cerrar sesión ingrese al siguiente enlace: https://accounts.spotify.com/es/status'));
}

function handleMoreSongs(req, res, spotifyApi) {
  console.log('more songs...', JSON.stringify(req.body));
  var context = req.body.queryResult.outputContexts;
  var artist;
  var songName;
  for (var i = 0; i < context.length; i++) {
    if (context[i].parameters) {
      artist = context[i].parameters.artist;
      songName = context[i].parameters.songName;
      break;
    }
  }

  if (!artist && !songName) {
    handleWelcome(req, res, spotifyApi, "");
    return;
  } else if (!artist && songName) {
    // hay veces que artista está en nombre canción, validar que pase esto
    request({
      url: 'http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=' + songName + '&api_key=b9cbb60547e087959b491b2f670c27f4&format=json&lang=es',
      method: 'GET',
      json: true
    }, function(err, resp, body) {
      var data = body;
      if (data.error) {
        handleWelcome(req, res, spotifyApi, "");
      } else {
        artist = songName;
        handlePlaySong(undefined, artist, req, res, spotifyApi);
      }
      return;
    });

    return;
  } else {
    handlePlaySong(undefined, artist, req, res, spotifyApi);
  }
  return;
}

function handleMoreInfo(req, res, spotifyApi) {
  console.log('req more info: ', JSON.stringify(req.body));
  var context = req.body.queryResult.outputContexts;
  var artist;
  var songName;
  for (var i = 0; i < context.length; i++) {
    if (context[i].parameters) {
      artist = context[i].parameters.artist;
      songName = context[i].parameters.songName;
      break;
    }
  }

  if (!artist && !songName) {
    handleWelcome(req, res, spotifyApi, "");
    return;
  } else if (!artist && songName) {
    // hay veces que artista está en nombre canción, validar que pase esto
    request({
      url: 'http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=' + songName + '&api_key=b9cbb60547e087959b491b2f670c27f4&format=json&lang=es',
      method: 'GET',
      json: true
    }, function(err, resp, body) {
      var data = body;
      if (data.error) {
        handleWelcome(req, res, spotifyApi, "");
        return;
      } else {
        artist = songName;
        request({
          url: 'http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=' + artist + '&api_key=b9cbb60547e087959b491b2f670c27f4&format=json&lang=es',
          method: 'GET',
          json: true
        }, function(err, resp, body) {

          var data = body;
          if (data.error) {
            sendResponse(res, 'el artista no se encontró :(, dale más tiempo a que mejore y aparecerá!');
          }
          console.log('artist: ', data);
          var titulo = "Info de " + artist;
          console.log('name artist: ', data.artist.name);
          var subtitulo = data.artist.bio.summary.replace(/<[^>]+>/g, '');
          var imageUrl = data.artist.image[1]["#text"];
          var verMas = data.artist.bio.links.link.href;
          var info = [
            {
              "card": {
                "title": titulo,
                "subtitle": subtitulo,
                "buttons": [
                  {
                    "text": "ver más del artista",
                    "postback": verMas
                  }
                ]
              }
            }
          ];
          console.log('enviando...,', info);

          res.json({"fulfillmentText": "Hemos notado que quieres mas información!", "fulfillmentMessages": info});
          return;
        });
      }
    });

  } else {
    request({
      url: 'http://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=' + artist + '&api_key=b9cbb60547e087959b491b2f670c27f4&format=json&lang=es',
      method: 'GET',
      json: true
    }, function(err, resp, body) {

      var data = body;
      if (data.error) {
        sendResponse(res, 'el artista no se encontró :(, dale más tiempo a que mejore y aparecerá!');
      }
      console.log('artist: ', data);
      var titulo = "Info de " + artist;
      console.log('name artist: ', data.artist.name);
      var subtitulo = data.artist.bio.summary.replace(/<[^>]+>/g, '');
      var imageUrl = data.artist.image[1]["#text"];
      var verMas = data.artist.bio.links.link.href;
      var info = [
        {
          "card": {
            "title": titulo,
            "subtitle": subtitulo,
            "buttons": [
              {
                "text": "ver más del artista",
                "postback": verMas
              }
            ]
          }
        }
      ];
      console.log('enviando...,', info);

      res.json({"fulfillmentText": "Hemos notado que quieres mas información!", "fulfillmentMessages": info});
      return;
    });
  }
  return;
}

function handlePlayUriSong(req, res, spotifyApi) {
  const ds = Datastore({
    projectId: projectId
  });
  // obtengo cancion asociada
  const key = ds.key([
    spotifyListSongDatastoreKind,
    getUserIdFromRequestData(req.body)
  ]);
  ds.get(key, (err, entity) => {
    if (!err) {
      if (entity) {
        // encontro registro con canciones
        var lista = entity.songs;
        var cancionElegida = req.body.queryResult.parameters.number;
        var song = lista[cancionElegida - 1];
        var songUri = song.songUri;
        var songInfo = song.info;
        spotifyApi.play({
          "uris": [songUri]
        }).then(() => sendResponse(res, "Reproduciendo " + songInfo));
      } else {
        sendError(res);
      }
    } else {
      // error general
      sendError(res);
    }
  })
}

function handlePlaySong(songName, artist, req, res, spotifyApi) {
  let query;
  if (songName && artist) {
    query = `track:${songName} artist:${artist}`;
  } else if (artist) {
    query = `artist:${artist}`;
  } else {
    query = songName;
  }
  spotifyApi.searchTracks(query).then(function (data) {
    console.log(JSON.stringify(data.body));
    const items = data.body.tracks.items;
    if (items.length > 0) {
      // si hay solo 1 reproduzco esa
      if (items.length === 1) {
        spotifyApi.play({
          "uris": [items[0].uri]
        }).then(() => sendResponse(res, "Reproduciendo " + items[0].name + " de " + items[0].artists[0].name));
      } else {
        var canciones = [];
        var listaUris = [];
        var cantidad;
        if (items.length > 8) {
          cantidad = 8;
        } else {
          cantidad = items.length;
        }
        for (var i = 0; i < cantidad; i++) {
          var songUri = items[i].uri;
          var songName = items[i].name;
          var info = "";
          var artistas = "";
          for (var j = 0; j < items[i].artists.length; j++) {
            artistas = artistas + " " + items[i].artists[j].name;
          }
          info = songName + " de" + artistas;
          var obj = {
            "card": {
              "title": info,
              "buttons": [{
                "text": "Reproducir",
                "postback": (i + 1) + ""
              }]
            }
          };
          canciones.push(obj);

          listaUris.push({
            "songUri": songUri,
            "info": info
          });
        }
        console.log('saliendo del for...');
        console.log('botones son: ', canciones);
        var mensajes = canciones;

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
  }, function (err) {
    sendError(res);
    console.log('Something went wrong!', err);
  });
}

function handlePlayAlbum(album, artist, req, res, spotifyApi) {
  var query;
  if (album) {
    query = `album:${album}`;
  }
  if (artist) {
    query = query + ` artist:${artist}`;
  }
  if (!album) {
    sendError(res);
    return;
  }

  console.log('antes de buscar..., album:' + album + ' artist:' + artist);
  spotifyApi.searchAlbums(query, {
    limit: 5,
    offset: 1
  }).then(function (data) {
    console.log('album respuesta: ', JSON.stringify(data.body));
    var items = data.body.albums.items;
    if (items.length <= 0) {
      sendResponse(res, `Lo siento, no he encontrado ese album`);
      return;
    }

    var albumId = items[0].id;
    var albumUri = items[0].uri;
    var albumName = items[0].name;

    console.log('uri: ', albumUri);

    spotifyApi.play({
      "context_uri": albumUri
    }).then(() => sendResponse(res, "Reproduciendo album " + albumName));

  }, function (err) {
    console.log('Something went wrong!', err);
    handleApiError(req, res, err, spotifyApi);
  });
}

function handlePlayRecommendations(req, res, spotifyApi, name) {
  console.log('play recomm');
  spotifyApi.getRecommendations({
    seed_genres: ['dance', 'electronic', 'electro', 'latin', 'pop']
  }).then(function(data) {
    console.log(JSON.stringify(data.body));
    var items = data.body.tracks;
    if (items.length > 0) {
      // si hay solo 1 reproduzco esa
      if (items.length == 1) {
        spotifyApi.play({
          "uris": [items[0].uri]
        }).then(() => sendResponse(res, "Reproduciendo " + items[0].name + " de " + items[0].artists[0].name));
      } else {
        var canciones = [];
        var listaUris = [];
        var cantidad;
        if (items.length > 8) {
          cantidad = 8;
        } else {
          cantidad = items.length;
        }
        console.log('entrando al for...');
        var obj = {
          "card": {
            "title": "Hola " + name + " tenemos estas canciones para ti!"
          }
        };
        canciones.push(obj);
        for (var i = 0; i < cantidad; i++) {
          var songUri = items[i].uri;
          var songName = items[i].name;
          var info = "";
          var artistas = "";
          for (var j = 0; j < items[i].artists.length; j++) {
            artistas = artistas + " " + items[i].artists[j].name;
          }
          info = songName + " de" + artistas;
          var obj = {
            "card": {
              "title": info,
              "buttons": [
                {
                  "text": "Reproducir",
                  "postback": (i + 1) + ""
                }
              ]
            }
          };
          canciones.push(obj);

          listaUris.push({"songUri": songUri, "info": info});
        }
        console.log('saliendo del for...');
        console.log('botones son: ', canciones);
        var mensajes = canciones;

        saveDatastoreItem({
          "userId": getUserIdFromRequestData(req.body),
          "songs": listaUris
        });
        // no se puede guardar en contexto anda a saber
        //res.json({"fulfillmentMessages": mensajes, "outputContexts":[{"name":"projects/${PROJECT_ID}/agent/sessions/${SESSION_ID}/contexts/context listauris", "lifespanCount":5, "parameters":{"listaUris":listaUris}}] });
        res.json({"fulfillmentMessages": mensajes});
      }
    } else {
      sendResponse(res, `Lo siento, no he encontrado esa canción`)
    }
  }, function(err) {
    sendError(res);
    console.log('Something went wrong!', err);
  });
}

function handlePlayFavourite(req, res, spotifyApi) {
  console.log('play fav');
  spotifyApi.getMyTopTracks({limit: 5}).then(function(data) {
    console.log(JSON.stringify(data.body));
    var items = data.body.items;
    if (items.length > 0) {
      // si hay solo 1 reproduzco esa
      if (items.length == 1) {
        spotifyApi.play({
          "uris": [items[0].uri]
        }).then(() => sendResponse(res, "Reproduciendo " + items[0].name + " de " + items[0].artists[0].name));
      } else {
        var canciones = [];
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
          info = songName + " de" + artistas;
          var obj = {
            "card": {
              "title": info,
              "buttons": [
                {
                  "text": "Reproducir",
                  "postback": (i + 1) + ""
                }
              ]
            }
          };
          canciones.push(obj);

          listaUris.push({"songUri": songUri, "info": info});
        }
        console.log('saliendo del for...');
        console.log('botones son: ', canciones);
        var mensajes = canciones;

        saveDatastoreItem({
          "userId": getUserIdFromRequestData(req.body),
          "songs": listaUris
        });
        // no se puede guardar en contexto anda a saber
        //res.json({"fulfillmentMessages": mensajes, "outputContexts":[{"name":"projects/${PROJECT_ID}/agent/sessions/${SESSION_ID}/contexts/context listauris", "lifespanCount":5, "parameters":{"listaUris":listaUris}}] });
        res.json({"fulfillmentMessages": mensajes});
      }
    } else {
      sendResponse(res, `Lo siento, no he encontrado esa canción`)
    }
  }, function(err) {
    sendError(res);
    console.log('Something went wrong!', err);
  });
}

function handlePlayPlaylistArtist(req, res, spotifyApi) {
  const artist = req.body.queryResult.parameters.artist;
  console.log('searching artist ' + artist);
  spotifyApi.searchArtists(artist).then(function (data) {
    console.log(JSON.stringify(data.body));
    const items = data.body.artists.items;
    if (items.length > 0) {
      const artistName = items[0].name;
      const artistUri = items[0].uri;
      spotifyApi.play({
        "context_uri": artistUri
      }).then(() => sendResponse(res, "Reproduciendo " + artistName));
    } else {
      sendResponse(res, `Lo siento, no he encontrado esa canción`);
    }
  }, function (err) {
    console.log('Something went wrong!', err);
  });
}

function handlePlay(req, res, spotifyApi) {
  spotifyApi.play().then(() => sendResponse(res, "Reproduciendo..."));
}

function handlePause(req, res, spotifyApi) {
  spotifyApi.pause().then(() => sendResponse(res, "Pausando..."));
}

function handleNext(req, res, spotifyApi) {
  spotifyApi.skipToNext().then((value) => {
    console.log('siguiente...', value);
    sendResponse(res, "Reproduciendo siguiente... ");
  });
}

function handlePrevious(req, res, spotifyApi) {
  spotifyApi.skipToPrevious().then((value) => {
    console.log('anterior...,', value);
    sendResponse(res, "Reproduciendo anterior...");
  }, (err) => {
    sendResponse(res, 'estás la última canción!, intenta ir a la siguiente')
  });
}

function getSpotifyCredentials() {
  return getDatastoreItem(spotifyCredentialsDatastoreKind, 'default');
}

function getUserAccessToken(userId) {
  return getDatastoreItem(accessTokensDatastoreKind, userId).then(item => {
    if (item) {
      console.log('accessToken: ' + item.accessToken);
      return item.accessToken;
    } else {
      return '';
    }
  });
}

function getUserRefreshToken(userId) {
  return getDatastoreItem(refreshTokensDatastoreKind, userId).then(item => {
    if (item) {
      console.log('refreshToken: ' + item.refreshToken);
      return item.refreshToken;
    } else {
      return '';
    }
  });
}

function getDatastoreItem(kind, key) {
  const datastore = Datastore({
    projectId: projectId
  });
  const datastoreKey = datastore.key([kind, key]);
  return datastore.get(datastoreKey).then(([item]) => {
    console.log('datastore item: ' + JSON.stringify(item));
    return item;
  });
}

function saveDatastoreItem(value) {
  console.log('guardando canciones...: ', value);
  const ds = Datastore({
    projectId: projectId
  });

  // pregunto si existe en bd esa key
  const key = ds.key([spotifyListSongDatastoreKind, value.userId]);
  ds.get(key, (err, entity) => {
    if (!err) {
      // no error guardo en bd
      const key = ds.key([spotifyListSongDatastoreKind, value.userId]);
      const entity = {
        key: key,
        data: [{
          "name": "songs",
          "value": value.songs
        }]
      };

      ds.save(entity, (err) => {
        if (!err) {
          console.log('canciones guardadas: ', value);
        } else {
          console.log('error al guardar');
        }
      });
    } else {
      // error general
      console.log('error general');
    }

  });
}

function deleteDatastoreItem(kind, key) {
  const datastore = Datastore({
    projectId: projectId
  });
  const datastoreKey = datastore.key([kind, key]);
  return datastore.delete(datastoreKey).then(() => {
    console.log(`Deleted item ${datastoreKey}`);
  });
}

function getUserIdFromRequestData(requestData) {
  var payload = requestData.originalDetectIntentRequest.payload;
  console.log('getuseridfromreqdata: ', payload);
  switch (payload.source) {
    case 'slack_testbot':
      if (payload.data.user.id) {
        return 'slack-' + payload.data.user.id;
      } else {
        return 'slack-' + payload.data.user;
      }
    case 'slack':
      console.log('es slack', payload.data);
      if (payload.data.user) {
        return 'slack-' + payload.data.user.id;
      } else if (payload.data.event.user.id) {
        return 'slack-' + payload.data.event.user.id;
      } else if (payload.data.event.user) {
        return 'slack-' + payload.data.event.user;
      } else {
        return "";
      }
    case 'skype':
      return 'skype-' + payload.data.address.user.id;
    case 'telegram':
      if (payload.data.message) {
        return 'telegram-' + payload.data.message.from.id;
      } else {
        return 'telegram-' + payload.data.callback_query.from.id;
      }
    default:
      return 'default';
  }

}

function getUserNameFromRequestData(requestData) {
  var payload = requestData.originalDetectIntentRequest.payload;
  switch (payload.source) {
    case 'slack_testbot':
      return '';
    case 'slack':
      return '';
    case 'skype':
      return 'skype-' + payload.data.address.user.id;
    case 'telegram':
      if (payload.data.message.chat.first_name) {
        return payload.data.message.chat.first_name;
      } else {
        return '';
      }
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

function sendError(res) {
  sendResponse(res, "Ups!, ocurrio un error :(, intenta de nuevo :) ");
}

function saveToken(userId, token) {
  console.log('guardando access token... token:', token);
  var ds = Datastore({
    projectId: projectId
  });

  if (token) {
    var key = ds.key([accessTokensDatastoreKind, userId]);
    var entity = {
      key: key,
      data: [{
        "name": "accessToken",
        "value": token
      }]
    };
    ds.save(entity, (err) => {
      if (!err) {
        console.log('token guardado: ', token);
      } else {
        console.log('error al guardar');
      }
    });
  }
}

function refrescarToken(userId, spotifyApi) {
  return new Promise(function (resolve, reject) {
    spotifyApi.searchAlbums('hola', {
      limit: 1,
      offset: 1
    }).then(function (data) {
      resolve(true);
    }, function (error) {
      console.log('error 1: ', JSON.stringify(error));
      // si es un error de auth refrescar token
      if (error.statusCode === 401) {
        spotifyApi.refreshAccessToken().then(function (data) {
          console.log('The access token has been refreshed!', data);
          // Save the access token so that it's used in future calls
          spotifyApi.setAccessToken(data.body['access_token']);
          //  spotifyApi.setRefreshToken(data.body['refresh_token']);
          saveToken(userId, data.body['access_token']);
          resolve(true);
        }, function (err) {
          console.log('Could not refresh access token', err);
          resolve(false);
        });
      } else {
        resolve(false);
      }
    });
  });
}
