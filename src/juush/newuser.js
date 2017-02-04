
import {juushErrorCatch, isAdmin, query, randomStr} from "./util.js";

//Create new user
export default async function(server, reqx){
    const {res, urldata, req} = reqx;
    //Only people on the same network as the server can create users
    if(isAdmin(req.connection.remoteAddress)){
        var newKey = randomStr(32);
        query.keys.insert({
            name: reqx.urldata.path[1],
            key: newKey,
            _id: await query.counter("keyid"),
        }).then(result => {
            serverLog("A new user has been created", reqx.urldata.path[1], newKey);
            res.setHeader("Content-Type", "text/plain");
            res.end(newKey);
        }).catch(juushErrorCatch(res));
    }else{
        res.writeHead(401, {
            "Content-Type": "text/html"
        });
        res.end("You cannot make users");
    }
};