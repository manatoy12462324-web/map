const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const fetch = global.fetch;
const app = express();
const server = http.createServer(app);

const io = new Server(server,{
    cors:{
        origin:"*"
    }
});

//////////////////////////////////////////////////////
// ルーム管理
//////////////////////////////////////////////////////

const rooms = {};
const gpsHistory = {};

async function mapMatch(points){

    const response = await fetch(
        "http://localhost:8002/trace_route",
        {
            method:"POST",
            headers:{
                "Content-Type":"application/json"
            },
            body:JSON.stringify({
                shape: points,
                costing:"auto"
            })
        }
    );

    return await response.json();
}

//////////////////////////////////////////////////////
// 接続
//////////////////////////////////////////////////////

io.on("connection",(socket)=>{

    console.log("接続:",socket.id);

    //////////////////////////////////////////////////
    // ルーム作成
    //////////////////////////////////////////////////

    socket.on("createRoom",(data)=>{

        socket.userId = data.userId;

        const { roomId,password } = data;

        //////////////////////////////////////////////////
        // 既に存在
        //////////////////////////////////////////////////

        if(rooms[roomId]){

            socket.emit("roomError",
                "既に存在するルームID"
            );

            return;
        }

        //////////////////////////////////////////////////
        // 作成
        //////////////////////////////////////////////////

        rooms[roomId] = {

            password,
            players:{}
        };

        //////////////////////////////////////////////////
        // Socket.IO room参加
        //////////////////////////////////////////////////

        socket.join(roomId);

        //////////////////////////////////////////////////
        // socket情報保存
        //////////////////////////////////////////////////

        socket.roomId = roomId;

        socket.emit("roomCreated");

        console.log("ルーム作成:",roomId);
    });

    //////////////////////////////////////////////////
    // ルーム参加
    //////////////////////////////////////////////////

    socket.on("joinRoom",(data)=>{

        socket.userId = data.userId;

        const { roomId,password } = data;

        //////////////////////////////////////////////////
        // ルーム存在確認
        //////////////////////////////////////////////////

        if(!rooms[roomId]){

            socket.emit(
                "roomError",
                "ルームが存在しません"
            );

            return;
        }

        //////////////////////////////////////////////////
        // パスワード確認
        //////////////////////////////////////////////////

        if(rooms[roomId].password !== password){

            socket.emit(
                "roomError",
                "パスワードが違います"
            );

            return;
        }

        //////////////////////////////////////////////////
        // room参加
        //////////////////////////////////////////////////

        socket.join(roomId);

        socket.roomId = roomId;

        socket.emit("roomJoined");

        console.log("参加:",roomId);
    });

    //////////////////////////////////////////////////
    // 位置更新
    //////////////////////////////////////////////////

    socket.on("updatePosition",async (data)=>{

    const roomId = data.roomId;

    ///////////////////////////////////////////////////////
    // ルーム存在確認
    ///////////////////////////////////////////////////////

    if(!rooms[roomId])return;

    if(!gpsHistory[socket.id]){
        gpsHistory[socket.id] = [];
    }

    gpsHistory[socket.id].push({
        lat:data.lat,
        lon:data.lng
    });

    if(gpsHistory[socket.id].length > 20){
        gpsHistory[socket.id].shift();
    }

    let snappedLat = data.lat;
    let snappedLng = data.lng;

    try{

        if(gpsHistory[socket.id].length >= 3){

            const result =
                await mapMatch(
                    gpsHistory[socket.id]
                );

            console.log(
                "Valhalla応答",
                result
            );

        // ここは後で調整
        }

    }catch(err){

        console.error(
        "Valhallaエラー",
        err
    );
}

    ///////////////////////////////////////////////////////
    // プレイヤー保存
    ///////////////////////////////////////////////////////

    rooms[roomId].players[socket.id] = {

        id: socket.id,

        userId: socket.userId,

        name: data.name,

        lat: snappedLat,
        lng: snappedLng,

        heading: data.heading
    };

    ///////////////////////////////////////////////////////
    // 全員へ送信
    ///////////////////////////////////////////////////////

    io.to(roomId).emit(

        "players",

        Object.values(
            rooms[roomId].players
        )
    );
});

    //////////////////////////////////////////////////
// ルーム退出
//////////////////////////////////////////////////

socket.on("leaveRoom",()=>{

    ///////////////////////////////////////////////////////
    // 未参加
    ///////////////////////////////////////////////////////

    if(!socket.roomId)return;

    const roomId = socket.roomId;

    ///////////////////////////////////////////////////////
    // プレイヤー削除
    ///////////////////////////////////////////////////////

    if(rooms[roomId]){

        delete rooms[roomId].players[socket.id];

        io.to(roomId).emit(
        "removePlayer",
        socket.id
    );

    if(
    Object.keys(
        rooms[roomId].players
    ).length === 0
){
    delete rooms[roomId];

    console.log(
        "空ルーム削除:",
        roomId
    );
}


    }

    ///////////////////////////////////////////////////////
    // Socket.IOルーム退出
    ///////////////////////////////////////////////////////

    socket.leave(roomId);

    ///////////////////////////////////////////////////////
    // 状態初期化
    ///////////////////////////////////////////////////////

    socket.roomId = null;

    ///////////////////////////////////////////////////////
    // 本人へ通知
    ///////////////////////////////////////////////////////

    socket.emit("roomLeft");

    console.log(
        "退出:",
        socket.id
    );
});

    //////////////////////////////////////////////////
    // 切断
    //////////////////////////////////////////////////

    socket.on("disconnect",()=>{

    const roomId = socket.roomId;

    if(roomId && rooms[roomId]){

        delete rooms[roomId].players[socket.id];

        io.to(roomId).emit(
            "removePlayer",
            socket.id
        );

        if(
            Object.keys(
                rooms[roomId].players
            ).length === 0
        ){
            delete rooms[roomId];

            console.log(
                "空ルーム削除:",
                roomId
            );
        }
    }

    console.log("切断:",socket.id);
});

});

server.listen(3000,()=>{

    console.log("Server Start");
});

