const sinon = require('sinon');

const cloudFunction = require('../index');

describe('Default Welcome Intent', function () {
  it('should respond with custom welcome message', function () {
    const req = {
      body: {
        queryResult: {
          intent: {
            displayName: "Default Welcome Intent"
          }
        },
        originalDetectIntentRequest: {
          payload: {
            source: 'telegram',
            data: {
              message: {
                chat: {
                  first_name: 'some_name'
                }
              }
            }
          }
        }
      }
    };
    const resAPI = {
      setHeader: function (key, value) {
      },
      send: function (response) {
      }
    };
    const res = sinon.mock(resAPI);
    res.expects('setHeader').once().withArgs('Content-Type', 'application/json');
    res.expects('send').once().withArgs(JSON.stringify({fulfillmentText: 'Bienvenido/a some_nam!'}));

    cloudFunction.fulfillmentHandler(req, resAPI);

    res.verify();
  });
});
