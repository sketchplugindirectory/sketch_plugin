/*
The MIT License (MIT)

Copyright (c) 2017 RealtimeBoard Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var api = new Api();
var siteURL = "https://realtimeboard.com/";
var path = siteURL + "api/v1/";
var boardURL = siteURL + "app/board/";
var exportPath = NSTemporaryDirectory() + "sketch-rtb-export/";

function dealWithErrors(context, message) {
  var alert = [[NSAlert alloc] init];
  [alert setMessageText: "Connection error"];

  if (message) {
    [alert setInformativeText: message];
  } else {
    [alert setInformativeText: "Please check your internet connection and retry."];
  }

  [alert runModal];
}

function Api() {
  Api.prototype.UploadEnum = {
    SUCCESS: 1,
    NO_ARTBOARDS: 2,
    NO_ARTBOARDS_SELECTED: 3,
    UPLOAD_FAILED: 4
  }

  Api.prototype.setSetting = function(name, value) {
    [[NSUserDefaults standardUserDefaults] setObject:value forKey:name];
    [[NSUserDefaults standardUserDefaults] synchronize];
  }

  Api.prototype.getSetting = function(name) {
    var value = [[NSUserDefaults standardUserDefaults] objectForKey:name];

    if (value) {
      return value;
    } else {
      return false;
    }
  }

  Api.prototype.setToken = function(token) {
    this.setSetting("rtb_token", token);
  }

  Api.prototype.getToken = function() {
    return this.getSetting("rtb_token");
  }

  Api.prototype.setLastBoardId = function(boardId) {
    this.setSetting("last_board_id", boardId);
  }

  Api.prototype.getLastBoardId = function() {
    return this.getSetting("last_board_id")
  }

  Api.prototype.setOpenBoard = function(openBoard) {
    this.setSetting("open_board", openBoard);
  }

  Api.prototype.getOpenBoard = function() {
    return this.getSetting("open_board");
  }

  Api.prototype.getBoards = function(context, errorHandlingInfo) {
    var accountsResult = api.accountsRequest(context, errorHandlingInfo);

    if (accountsResult) {
      accountsResult = accountsResult.filter(function(item) {
        return !item.expired;
      });
      var boards = [];

      for (var i = 0; i < accountsResult.length; i++) {
        var accountBoards = api.boardsRequest(context, accountsResult[i].id, errorHandlingInfo);

        if (accountBoards) {
          accountBoards = accountBoards.data;

          for (var j = 0; j < accountBoards.length; j++) {
            if (accountBoards[j].currentUserPermission.role == "EDITOR"
            || accountBoards[j].currentUserPermission.role == "OWNER") {
              var board = { boardId: accountBoards[j]["id"],
                title: accountBoards[j]["title"],
                lastOpenedByMeDate: accountBoards[j]["lastOpenedByMeDate"]
              };
              boards.push(board);
            }
          }
        }
      }

      boards = boards.sort(function(a, b) {
        var aDate = new Date(a.lastOpenedByMeDate);
        var bDate = new Date(b.lastOpenedByMeDate);

        if (aDate.getTime() < bDate.getTime())
          return 1;
        else {
          return -1;
        }
      });

      return boards;
    }
    return false;
  }

  Api.prototype.authRequest = function(context, data) {
    var result = this.request(context, "auth", "POST", data);
    return result;
  }

  Api.prototype.authCheckRequest = function(context, errorHandlingInfo) {
    var token = this.getToken();
    var result = false;

    if (token) {
      var url = "auth/check";
      var data = { token: token };
      result = this.request(context, url, "POST", data, errorHandlingInfo);
    }

    return result;
  }

  Api.prototype.logoutRequest = function(context, errorHandlingInfo) {
    var token = this.getToken();
    var result = false;

    if (token) {
      var url = "auth/logout";
      var data = { token: token };
      result = this.request(context, url, "POST", data, errorHandlingInfo);
    }

    return result;
  }

  Api.prototype.accountsRequest = function(context, errorHandlingInfo) {
    var token = this.getToken();
    var result = null;

    if (token) {
      var url = "accounts/?fields=id,title,currentUserPermission,expired";
      result = this.request(context, url, "GET", null, errorHandlingInfo);
    }

    return result;
  }

  Api.prototype.boardsRequest = function(context, accountId, errorHandlingInfo) {
    var token = this.getToken();
    var result = null;

    if (token) {
      var url = "boards/?attachment=" + accountId + "&fields=title,id,currentUserPermission{role},lastOpenedByMeDate&limit=1000";
      result = this.request(context, url, "GET", null, errorHandlingInfo);
    }

    return result;
  }

  Api.prototype.request = function(context, url, method, data, errorHandlingInfo) {
    var fullURL = path + url;
    var stringURL = [NSString stringWithFormat:fullURL];
    var webStringURL = [stringURL stringByAddingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
    var request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:webStringURL]];

    [request setHTTPMethod:method];
    [request setValue:"application/json" forHTTPHeaderField:"Accept"];
    [request setValue:"application/json" forHTTPHeaderField:"Content-Type"];

    var token = this.getToken();
    var auth = "hash " + token;
    var authHeader = "Authorization";

    [request setValue:auth forHTTPHeaderField:authHeader];

    if (data) {
      var postData = [NSJSONSerialization dataWithJSONObject:data options:NSUTF8StringEncoding error:nil];
      [request setHTTPBody:postData];
    }

    var response = [[MOPointer alloc] init];
    var error = [[MOPointer alloc] init];
    var dataResp = [NSURLConnection sendSynchronousRequest:request returningResponse:response error:error];

    if (error.value() == nil && dataResp != nil) {
      var res = [NSJSONSerialization JSONObjectWithData:dataResp options:NSJSONReadingMutableLeaves error:nil]
      if (res!=nil && res.errMessage != nil) {
        if (errorHandlingInfo && errorHandlingInfo.message) {
          dealWithErrors(context, errorHandlingInfo.message);
        }

        return false;
      }

      var responseText = [[NSString alloc] initWithData:dataResp encoding:NSUTF8StringEncoding];

      try {
        var json = JSON.parse(responseText);

        return json;
      } catch(e) {
        var message = "Unable to parse response data for path: " + url;

        dealWithErrors(context, message);

        return false;
      }
    } else {
      if (errorHandlingInfo) {
        errorHandlingInfo.connectionError = true;
      }

      dealWithErrors(context);

      return false;
    }
  }

  Api.prototype.uploadArtboardsToRTB = function(context, boardId, exportAll) {
    var fullURL = path + "boards/" + boardId + "/integrations/imageplugin";
    var stringURL = [NSString stringWithFormat:fullURL];
    var webStringURL = [stringURL stringByAddingPercentEscapesUsingEncoding:NSUTF8StringEncoding];
    var token = this.getToken();
    var auth = "hash " + token;
    var exportInfoList = this.artboardsToPNG(context, exportAll);

    if (exportInfoList.length == 0) {
      var document = context.document;
      var page = [document currentPage];
      var artboards = [page artboards];

      if (artboards.length == 0) {
        return this.UploadEnum.NO_ARTBOARDS;
      } else {
        return this.UploadEnum.NO_ARTBOARDS_SELECTED;
      }
    }

    var task = [[NSTask alloc] init];
    [task setLaunchPath:"/usr/bin/curl"];

    var makeDataString = function(positionData, identifier) {
      if (!positionData) {
        positionData = '';
      }

      var idField = identifier ? '"id": "'+ identifier + '",' : '';
      return '{' + idField + '"type": "ImageWidget","json": "{\\"transformationData\\": { ' + positionData + ' }}"}';
    };

    var dataString = '',
        dataArray = [];

    for (var i = 0; i < exportInfoList.length; i++) {
      var artboard = exportInfoList[i].artboard;
      var resourceId = context.command.valueForKey_onLayer_forPluginIdentifier(boardId, artboard, "rtb_sync");
      var absoluteInfluenceRect = [artboard absoluteInfluenceRect];
      var xPos = absoluteInfluenceRect.origin.x;
      var yPos = absoluteInfluenceRect.origin.y;
      var width = absoluteInfluenceRect.size.width;
      var height = absoluteInfluenceRect.size.height;
      var centralXPos = width / 2 + xPos;
      var centralYPos = height / 2 + yPos;
      var transformationData = '\\"positionData\\":{\\"x\\": ' + centralXPos + ', \\"y\\":' + centralYPos + ' }';

      if (resourceId) {
        dataArray.push(makeDataString(transformationData, resourceId));
      } else {
        dataArray.push(makeDataString(transformationData));
      }
    }

    dataString = dataArray.join(', ');

    var graphicsPluginRequest = 'GraphicsPluginRequest={"data":[' + dataString + ']};type=application/json ';
    log(graphicsPluginRequest);
    var args = [[NSMutableArray alloc] init];

    args.addObject("-v");
    args.addObject("POST");
    args.addObject("--header");
    args.addObject("Content-Type: multipart/form-data");
    args.addObject("--header");
    args.addObject("Authorization: " + auth);
    args.addObject("--header");
    args.addObject("Accept: application/json");
    args.addObject("--header");
    args.addObject("X-Requested-With: XMLHttpRequest");
    args.addObject("--header");
    args.addObject("Connection: keep-alive");
    args.addObject("--compressed");
    args.addObject("-F");
    args.addObject(graphicsPluginRequest);

    for (var i = 0; i < exportInfoList.length; i++) {
      args.addObject("-F");
      args.addObject("ArtboardName1=@" + exportInfoList[i]["path"]);
    }

    args.addObject(fullURL);

    [task setArguments:args];

    var outputPipe = [NSPipe pipe];

    [task setStandardOutput:outputPipe];
    [task launch];

    var outputData = [[outputPipe fileHandleForReading] readDataToEndOfFile];

    this.clearExportFolder();

    var classNameOfOuput = NSStringFromClass([outputData class]);

    if (classNameOfOuput != "_NSZeroData") {
      var res = [NSJSONSerialization JSONObjectWithData:outputData options:NSJSONReadingMutableLeaves error:nil]
      if (res != null) {
        if (res.error != nil) {
          return this.UploadEnum.UPLOAD_FAILED;
        } else {
          for (var i = 0; i < res.widgets.length; i++) {
            var artboard = exportInfoList[i];
            context.command.setValue_forKey_onLayer_forPluginIdentifier(res.widgets[i]["resourceId"], boardId, artboard.artboard, "rtb_sync");
          }
          return this.UploadEnum.SUCCESS;
        }
      } else {
        return this.UploadEnum.UPLOAD_FAILED;
      }
      return this.UploadEnum.UPLOAD_FAILED;
    } else {
      return this.UploadEnum.UPLOAD_FAILED;
    }
  }

  Api.prototype.artboardsToPNG = function(context, exportAll) {
    var document = context.document;
    var page = [document currentPage];
    var artboards = [page artboards];
    var exportInfoList = [];

    for (var i = 0; i < artboards.length; i++) {
      if (exportAll == 1 || (artboards[i].isSelected() && exportAll == 0)) {
        var msartboard = artboards[i];
        var artboardID = [msartboard objectID];
        var name = [msartboard name];
        var path = exportPath + "/" + artboardID + "/" + name + ".png";
        var format = [[MSExportFormat alloc] init];

        format.fileFormat = "png";

        var exportRequest = [[MSExportRequest exportRequestsFromExportableLayer:msartboard exportFormats:[format] useIDForName:true] firstObject];
        [document saveArtboardOrSlice:exportRequest toFile:path];

        var exportInfo = { "artboardID": artboardID, "artboard": msartboard, "path": path };
        exportInfoList.push(exportInfo);
      }
    }

    return exportInfoList;
  }

  Api.prototype.clearExportFolder = function() {
    var manager = [NSFileManager defaultManager];
    [manager removeItemAtPath:exportPath error:nil];
  }
}
