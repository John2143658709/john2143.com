
import * as U from "./util.js";

//You will get a referer and range if you are trying to stream an audio/video
const isStreamRequest = req => req.headers.referer && req.headers.range;

//This will serve a stream request. It does no kind of validation to see
//if the user can actually access that content.
const serveStreamRequest = async function(reqx, filepath){
    const rangeRequestRegex = /bytes=(\d*)-(\d*)/;
    let stat;

    try{
        //statSync fails if filepath does not exist
        stat = fs.statSync(filepath);
    }catch(e){
        reqx.res.writeHead(400, {});
        reqx.res.end();
        return;
    }

    const range = rangeRequestRegex.exec(reqx.req.headers.range || "");
    const fullContentLength = stat.size;
    const rangeStart = Number(range[1]);
    let rangeEnd;

    if(range[2] === ""){
        rangeEnd = fullContentLength - 1;
    }else{
        rangeEnd = Number(range[2]);
    }

    const contentLength = rangeEnd - rangeStart + 1;

    if(contentLength <= 0 ||
        rangeStart >= fullContentLength ||
        rangeEnd >= fullContentLength
    ){
        reqx.res.writeHead(416, {}); //Cannot deliver range
        reqx.res.end();
        return;
    }

    reqx.res.writeHead(206, { //Partial content
        //Ignoring Content-Type to not need a db request
        //Add it back in if this ever requires db stuff
        "Content-Length": contentLength,
        "Content-Range": "bytes " + rangeStart + "-" + rangeEnd + "/" + fullContentLength,
    });

    const filePipe = fs.createReadStream(filepath, {start: rangeStart, end: rangeEnd});
    reqx.res.on("error", () => filePipe.end());
    filePipe.pipe(reqx.res);
};

fs.unlinkAsync = function(path){
    return new Promise(function(resolve, reject){
        fs.unlink(path, function(err){
            if(err) reject();
            resolve();
        });
    });
};

const setMimeType = async function(id, newmime){
    return await Promise.all([
        U.query.index.updateOne({_id: id}, {$set: {mimetype: newmime}}),
        newmime === "deleted" && fs.unlinkAsync(U.getFilename(id)),
    ]);
};

const shouldInline = function(filedata, mime){
    //const inlineTypes = [
        //"txt", "text", "png", "jpg", "jpeg", "html",
        //"webm", "mp4", "mp3", "wav", "vorbis"
    //];
    //Mimetype is supplied by the user, meaning the subset may not exist

    //const regex = /(.+)\/?(.+)?/g;
    //var regexResult = regex.exec(mime);
    //var category = regexResult[1];
    //var subset = regexResult[2];

    //return category === "video" || category === "audio" ||
        //category === "image" || category === "text";

    //just let the browser decide
    return true;
};

const processDownload = function(reqx, data, disposition){
    const uploadID = data._id;
    const filepath = U.getFilename(uploadID);

    if(data.mimetype === "deleted"){
        reqx.doHTML("This file has been deleted.", 410);
        return;
    }else if(data.mimetype.split("/")[0] === "d"){
        reqx.doHTML("This file has been disabled by the uplaoder. It may be re-enabled in the future.");
        return;
    }else if(data.mimetype === "expired"){
        reqx.doHTML("this file has been automatically deleted.");
        return;
    }

    //Try to get file details
    let stat;
    try{
        stat = fs.statSync(filepath);
    }catch(e){
        reqx.doHTML("Internal error: file may have been manually deleted.", 500);
        serverLog(e);
        return;
    }

    //Do the database call to increment downloads
    let incDL = true;
    //What to do with the content:
    //  inline, attachment (download)
    let codisp = "inline";

    //dl for download
    if(disposition === "dl"){
        codisp = "attachment";
    //thumbnail
    }else if(disposition === "thumb"){
        incDL = false;
    }else{
        //Guess what should be done
        if(shouldInline(stat, data.mimetype)){
            //NOOP
        }else{
            codisp = "attachment";
        }
    }

    //Send filename with content-disposition
    codisp += '; filename="' + data.filename + '"';

    if(incDL){
        U.query.index.updateOne({_id: uploadID}, {
            $inc: {downloads: 1},
            $set: {lastdownload: new Date()},
        }).catch(err => {
            serverLog("Error when incrementing download. " + uploadID, err);
        });
    }

    reqx.res.writeHead(200, {
        "Content-Type": data.mimetype,
        "Content-Disposition": codisp,
        "Content-Length": stat.size,
        "Cache-Control": "max-age=300",
        "Accept-Ranges": "bytes",
    });

    //Stream file from disk directly
    const stream = fs.createReadStream(filepath);
    stream.pipe(reqx.res);
};

const download = async function(server, reqx){
    let uploadID = reqx.urldata.path[1];
    if(!uploadID || uploadID === ""){
        reqx.res.statusCode = 404;
        reqx.res.end("No file supplied");
        return;
    }

    //ignore extension
    uploadID = uploadID.split(".")[0];

    //What the user wants to do with the file
    const disposition = reqx.urldata.path[2];

    if(isStreamRequest(reqx.req)){
        return serveStreamRequest(reqx, U.getFilename(uploadID));
    }

    if(disposition === "delete"){
        const canDo = await U.ipHasAccess(reqx.req.connection.remoteAddress, uploadID);

        if(canDo === "NOFILE"){
            reqx.doHTML("That file does not exist", 404);
            return;
        }else if(canDo === "NOACCESS"){
            reqx.doHTML("You do not have access to rename this file.", 401);
            return;
        }else if(canDo){
            reqx.doHTML("AccessError: E" + canDo, 407);
            return;
        }

        const result = await setMimeType(uploadID, "deleted")
        reqx.doHTML("File successfully deleted. It will still appear in your user page.");
    }else if(disposition === "info"){
        const data = await U.query.index.findOne({_id: uploadID});
        if(!data){
            res.writeHead(404, {
                "Content-Type": "text/html"
            });
            res.end("This upload does not exist");
            return;
        }

        const user = await U.query.keys.findOne({_id: data.keyid});

        const res = reqx.res;

        res.writeHead(200, {
            "Content-Type": "text/html",
        });
        res.write("Filename: " + data.filename);
        res.write("<br>Upload date: " + data.uploaddate);
        res.write("<br>Uploaded by: " + user.name);
        res.write("<br>Downloads: " + data.downloads);
        res.write("<br>File Type: " + data.mimetype);
        res.end();
    }else if(disposition === "rename"){
        const canDo = await U.ipHasAccess(reqx.req.connection.remoteAddress, uploadID);

        if(canDo === "NOFILE"){
            reqx.doHTML("That file does not exist", 404);
            return;
        }else if(canDo === "NOACCESS"){
            reqx.doHTML("You do not have access to rename this file.", 401);
            return;
        }else if(canDo){
            reqx.doHTML("AccessError: E" + canDo, 401);
            return;
        }

        const oldName = (await U.query.index.findOne({_id: uploadID}, {filename: 1})).filename;
        const newName = decodeURI(reqx.urldata.path[3]);
        const oldFileExt = U.guessFileExtension(oldName);
        const newFileExt = U.guessFileExtension(newName);

        let name = newName;

        if(!newFileExt && oldFileExt){
            name += "." + oldFileExt;
        }

        await U.query.index.updateOne({_id: uploadID}, {$set: {filename: name}});

        reqx.res.end(name);
    }else if(disposition === "hide"){
        const canDo = await U.ipHasAccess(reqx.req.connection.remoteAddress, uploadID);

        if(canDo === "NOFILE"){
            reqx.doHTML("That file does not exist", 404);
            return;
        }else if(canDo === "NOACCESS"){
            reqx.doHTML("You do not have access to XXX file.", 401);
            return;
        }else if(canDo){
            reqx.doHTML("AccessError: E" + canDo, 401);
            return;
        }

        await U.setModifier(uploadID, "hidden", true);
        reqx.res.end("hidden");
    }else if(disposition === "unhide"){
        const canDo = await U.ipHasAccess(reqx.req.connection.remoteAddress, uploadID);

        if(canDo === "NOFILE"){
            reqx.doHTML("That file does not exist", 404);
            return;
        }else if(canDo === "NOACCESS"){
            reqx.doHTML("You do not have access to XXX file.", 401);
            return;
        }else if(canDo){
            reqx.doHTML("AccessError: E" + canDo, 401);
            return;
        }

        await U.setModifier(uploadID, "hidden", undefined);
        reqx.res.end("unhidden");
    }else{
        const result = await U.query.index.findOne({_id: uploadID}, {mimetype: 1, filename: 1, id: 1});
        if(!result){
            reqx.doHTML("This upload does not exist", 404);
            return;
        }
        processDownload(reqx, result, disposition);
    }
};

export default async function(server, reqx){
    try{
        await download(server, reqx);
    }catch(e){
        U.juushError(reqx.res, e, 500);
    }
};