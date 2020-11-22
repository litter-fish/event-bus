import { Subscriber } from 'rxjs/internal/Subscriber';
import { Subject } from 'rxjs/internal/Subject';

export class EventBus<T extends EventBusModel> {

    private busSubject: Subject<T> = new Subject<T>();

    private subscribeGroup = new Map<string, Subscriber<any>>();

    private eventStrategy = {};

    constructor(T) {
        this.initStrategy(T);
    }

    protected setSubjectType(subject: Subject<T>) {
        if (subject == null || !(subject instanceof Subject)) {
            console.warn(`设置的参数必须是Subject类型的或是其子类，如：[
                BehaviorSubject、AsyncSubject、ReplaySubject
            ]`);
            return false;
        }
        // 销毁原来的所有订阅事件
        this.off(null);
        this.busSubject = subject;
        return true;
    }

    // 发射事件
    public emit(eventBusModel: EventBusModel) {
        let event = this.createInstance(eventBusModel['__ob__'], eventBusModel.type, eventBusModel.subType, eventBusModel.data);
        Object.keys(this.eventStrategy[event.type]).forEach(key => {
            Utils.def(this.eventStrategy[event.type][key], 'alreadyCalled', false, false);
        })
        this.busSubject.next(event);
    }

    // 捕获事件
    public on(context, callback?: Function) {
        const key = context.constructor.name;
        if (this.subscribeGroup.has(key)) {
            return this.subscribeGroup.get(key)
        }
        this.$on({key, callback, context});
        return ;
    }

    private $on(obj: {
        key: string,
        callback: Function,
        context
    }) {
        let subscribe: Subscriber<any>;
        try {
            subscribe = this.busSubject.subscribe(
                this.next(obj.callback, obj.context, obj.key, subscribe),
                this.error(obj.key, subscribe, obj.callback)
            ) as Subscriber<any>;
            this.subscribeGroup.set(obj.key, subscribe);
        } catch (ex) {
            this.error(obj.key, subscribe, obj.callback)(ex);
        }
    }

    private next(callback: Function, context, key, subscribe) {
        let name = context.constructor.name;
        let self = context;
        return (val: T) => {
            try {
                let cb = this.eventStrategy[val.type]['__cb__'];
                if (!cb) {
                    const obj = this.eventStrategy[val.type][name];
                    if (obj) {
                        cb = this.eventStrategy[val.type][name]['__cb__'];
                    }
                }
                //
                if (cb) {
                    cb.context = self;
                }
                if (!cb && !callback) {
                    console.warn(`${val.type} - ${name} 没有提供回调方法`);
                    return;
                }

                if (val.subType) {
                    this.callFun(this.eventStrategy[val.type], self, val);
                } else {
                    if(Utils.isPlainObject(val['__ob__'][val.type])) {
                        cb.reset();
                    } else {
                        if (callback) {
                            callback.apply(self, [val]);
                        } else {
                            this.callFun(this.eventStrategy[val.type][name], self, val);
                        }
                    }
                }
            } catch (ex) {
                console.error(ex);
                // 异常了会取消订阅信息？？？， 重新加上订阅信息
                this.reon(key, subscribe, callback);
            }
        }
    }

    /**
     * 如果多个组件都on了同一个事件，如果发送
     */
    private callFun(fun, context, val) {
        if (fun) {
            const alreadyCalled = fun['alreadyCalled'] || false;
            if (alreadyCalled) {
                console.log(`${val.type} - ${context.constructor.name} alreadyCalled`);
                return;
            }
            fun['func'].apply(context, [val.data]);
            fun['alreadyCalled'] = true;
        }
    }

    private error(key, subscribe, callback) {
        return error => {
            console.error(error);
            this.reon(key, subscribe, callback);
        }
    }

    private reon(key: string, subscribe: Subscriber<any>, callback) {
        // 防止内存泄漏
        if (subscribe) {
            subscribe.unsubscribe();
        }
        this.on(key, callback);
    }

    // 注销事件
    public off(key?: string) {
        if (this.subscribeGroup.size === 0) {
            return true;
        }
        key = Utils.getSubKey();
        if (key) {
            if (this.subscribeGroup.has(key)) {
                this.subscribeGroup.get(key).unsubscribe();
                this.subscribeGroup.delete(key);
            }
            return true;
        }
        this.subscribeGroup.forEach((value, key) => {
            value.unsubscribe();
            this.subscribeGroup.delete(key);
        });
    }

    private createInstance(c: new (type: any, subType: any, data: any) => T,
        type: any, subType: any, data: any): T {
        return new c(type, subType, data);
    }

    private initStrategy(T) {
        const keys = Object.keys(T);
        keys.forEach(key => {
            if (Utils.isPlainObject(T[key])) {
                this.walk(key);
                Object.keys(T[key]).forEach(element => {
                    this.proxy(this[key], key, element);
                    this.defineReactive(this.eventStrategy[key], element, (args) => {
                        console.warn(`warn: ${key}`);
                        const subKey = Utils.getSubKey();
                        const cb = this.eventStrategy[args.type][subKey]['__cb__'];
                        if (cb) {
                            cb.dowait({[args.subType]: args.data});
                        }
                    });
                });
                Utils.def(this.eventStrategy[key], '__c__', Object.keys(T[key]).length, false);
            } else {
                this.walk(key);
            }
        });
    }

    protected setStrategy(target, key, callback) {
        target[key] = callback.bind(this);
    }

    public getEventStrategy(type) {
        return this.eventStrategy;
    }

    private defineReactive(
        obj: Object,
        key: string,
        val: any
    ) {
        const property = Object.getOwnPropertyDescriptor(obj, key);
        if (property && property.configurable === false) {
            return;
        }

        const getter = property && property.get;
        const setter = property && property.set;
        if ((!getter || setter) && arguments.length === 2) {
            val = obj[key];
        }
        // 劫持get、set方法
        Object.defineProperty(obj, key, {
            enumerable: true,
            configurable: true,
            get: () => {
                // 调用原来取值逻辑
                const value = getter ? getter.call(obj) : val;
                return value;
            },
            set: (newVal) => {
                const value = getter ? getter.call(obj) : val;
                if (newVal === value || (newVal !== newVal && value !== value)) {
                    return;
                }
                if (getter && !setter) return;
                if (setter) {
                    setter.call(obj, newVal);
                } else {
                    val = newVal;
                }
            }
        })
    }

    private proxy(target: Object, sourceKey: string, key: string) {

        const sharedPropertyDefinition = {
            enumerable: true,
            configurable: true,
            get: () => {},
            set: (val, context?) => {}
        }

        sharedPropertyDefinition.get = () => {
            if (Utils.isPlainObject(this[sourceKey])) {
                const subKey = Utils.getSubKey();
                return (subKey || this.constructor.name !== subKey) ? this[sourceKey][key][subKey] : this[sourceKey][key];
            } else {
                const subKey = Utils.getSubKey();
                return (subKey || this.constructor.name !== subKey) ? this[sourceKey][key][subKey] : this[sourceKey][key];
            }
        }
        sharedPropertyDefinition.set =  (val, context?) => {
            const subKey = Utils.getSubKey();
            const c = this[sourceKey][key]['__c__'];
            if (subKey || this.constructor.name !== subKey) {
                this[sourceKey][key][subKey] = {'func': val};
                //if (cb) {
                    this[sourceKey][key][subKey]['__cb__'] = new CyclicBarrier(c || 1, val, this);
                //}
            } else {
                this[sourceKey][key] = {'func': val};
                //if (cb) {
                    this[sourceKey][key]['__cb__'] = new CyclicBarrier(c || 1, val, this);
                //}
            }
        }
        Object.defineProperty(target, key, sharedPropertyDefinition);
    }

    private walk(key) {
        this.proxy(this, 'eventStrategy', key);
        this.defineReactive(this.eventStrategy, key, (...args) => {
            console.warn(`warn: ${key}`)
        });
    }
}

export class EventBusModel {
    private _type: String;
    private _subType: String;
    private _data: any;

    constructor(type: any = null, subType: any = null, data: any = null) {
        this._type = type;
        this._data = data;
        this._subType = subType;
        Utils.def(this, '__ob__', EventBusModel);
    }

    public get type(): any {
        return this._type;
    }
    public get subType(): any {
        return this._subType;
    }

    public set data(value: any) {
        this._data = value;
    }

    public get data(): any {
        return this._data;
    }

    public def(obj: Object, key: string, val: any, enumerable?: boolean) {
        Utils.def(obj, key, val, enumerable);
    }

}

class CyclicBarrier {
    private sync;
    constructor(
        public count: number = 1,
        public callback: Function,
        public context
    ) {
        this.sync = this.run();
        this.sync.next();
    }

    private *run() {
        let obj = {};
        const resultObj = {};
        for (let i = 0; i < this.count; i++) {
            obj = yield Object.assign(resultObj, obj);
        }
        Object.assign(resultObj, obj);
        console.log('yield invoker');
        this.callback.bind(this.context, resultObj)(resultObj);
    }

    public dowait(parameters) {
        this.sync.next(parameters);
    }

    public reset() {
        this.sync = this.run();
        this.sync.next();
    }
}

class Utils {
    public static def(obj: Object, key: string, val: any, enumerable?: boolean) {
        Object.defineProperty(obj, key, {
            value: val,
            enumerable: !!enumerable,
            writable: true,
            configurable: true
        })
    }

    public static getSubKey() {
        try {
            const stack = new Error('').stack;
            const subKey = stack.match(/((?<=at[^\r\n\f]*)((?:\S*)(?=\.<anonymous>))|(?<=at[^\r\n\f]+new[^S])([^\s]+)|(?<=at[^\r\n\f])((?!Function).)+(?=\.push))/g);
            if (!subKey) {
                //throw arguments.callee;
            }
            return subKey[0];
        } catch(ex) {
        }

        return null;
    }

    public static isPlainObject (obj: any): boolean {
        return Object.prototype.toString.call(obj) === '[object Object]'
    }
}
