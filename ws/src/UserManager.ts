import { WebSocket } from "ws";
import { User } from "./User";
import { SubscriptionManager } from "./SubscriptionManager";

export class UserManager {
    private static instance : UserManager;
    private users: Map<string, User> = new Map();

    constructor(){}

    public static getInstance(){
        if(!UserManager.instance){
            UserManager.instance = new UserManager();
        }
        return UserManager.instance;
    }

    public addUser(ws: WebSocket){
        const id = this.getRandomId();
        const user = new User(id, ws);
        this.users.set(id, user);
        this.resgisterOnClose(ws, id);
        return user;
    }

    private resgisterOnClose(ws: WebSocket, id: string){
        ws.on("close", () => {
            this.users.delete(id);
            SubscriptionManager.getInstance().userLeft(id);
        })
    }

    public getUser(id: string){
        return this.users.get(id);
    }

    private getRandomId(){
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
}