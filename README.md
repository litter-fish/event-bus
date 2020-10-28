### 使用总线（event-bus）进行父子组件之间的通信

#### 传统的Input、emit父子组件通讯的局限性

项目中存在这样一个组件，它是通过弹框的方式进行展示的，最外面一层otn-end-config存在一个确认按钮，这时我们需要通过父组件：otn-end-config，传递数据给子组件：basic-attr-eoo、access-attr、qos-config-panel、other-attr这些组件。因为Input和emit只能在直接的父子之间进行数据交互，所以通过Input的方式进行父到子组件数据传递，则需要一层一层的传递。而且同时如果这些组件选择完值后需要告诉最外层的父组件otn-end-config以便让它进行数据收集，按照emit方式处理起来会很麻烦。而使用总线（event-bus）方式将变的非常简单。
```
<otn-end-config>
    <terminal-end>
        <basic-attr>
            <basic-attr-eoo></basic-attr-eoo>
        </basic-attr>
        <access-attr></access-attr>
        <qos-config-panel></qos-config-panel>
        <other-attr></other-attr>
    </terminal-end>
</otn-end-config>
```

#### 总线（event-bus）的使用介绍

首先需要根据需要定义一个继承EventBusModel的model，表示需要进行的操作集
```
export class MutliEventBusModel extends EventBusModel {
    // 表示这个操作需要经过几个子操作才能完成
    public static EVENT_END_CONFIG_OK = {
        EVENT_END_CONFIG_OK_BASICE: 'EVENT_END_CONFIG_OK_BASICE',
        EVENT_END_CONFIG_OK_ACCESS: 'EVENT_END_CONFIG_OK_ACCESS',
        EVENT_END_CONFIG_OK_QOS: 'EVENT_END_CONFIG_OK_QOS',
        EVENT_END_CONFIG_OK_OTHER: 'EVENT_END_CONFIG_OK_OTHER'
    };

    constructor(type: any = null, subType: any = null, data: any = null) {
        super(type, subType, data);
        this.def(this, '__ob__', MutliEventBusModel);
    }
}
```

接着需要定义一个继承EventBus的服务处理类MutliEventBus，用于专门处理上面定义的动作
```
export class MutliEventBus extends EventBus<MutliEventBusModel> {
    constructor() {
        super(MutliEventBusModel);
    }
}
```

然后将该处理服务类导入到module中
```
@NgModule({
    imports: [
    ],
    providers: [
        SubEventBus,
        MutliEventBus
    ],
    exports: [],
    declarations: [
    ]
})
export class $TestModule {

}
```

可以通过on注册一个事件，第一个参数表示一个全局唯一的key值，后期事件的销毁需要根据这个key进行，第二个参数是一个回调方法，第三个参数代表当前实例。
组件otn-end-config中注册了一个如下事件：
```
mutliEventBus.on('otn-end-config', (mutliEventBusModel: MutliEventBusModel) => {}, this)；
```

同时指定EVENT_END_CONFIG_OK动作的处理逻辑，直接给指定下标的总线事件赋值处理函数即可，如：
```
mutliEventBus['EVENT_END_CONFIG_OK'] = (mutliEventBusModel, context) => {
    console.log(`sub-test: ${JSON.stringify(mutliEventBusModel)}`);
}
```

对于存在子操作的操作，不需要给每一个子操作指定操作方法，event-bus会自动进行，最终会给总操作即上面的EVENT_END_CONFIG_OK操作返回这样一组数据
```
{
    EVENT_END_CONFIG_OK_BASICE: basice组件的数据对象,
    EVENT_END_CONFIG_OK_ACCESS: access组件的数据对象,
    EVENT_END_CONFIG_OK_QOS: qos组件的数据对象,
    EVENT_END_CONFIG_OK_OTHER: other组件的数据对象
}
```

上面介绍完了事件注册，接着看下怎样emit事件，首先otn-end-config通过emit给每个子组件发送一个事件（EVENT_END_CONFIG_OK），告诉它们我要进行收集数据了，让它们都准备好
```
this.SubEventBus.emit(new SubEventBusModel('EVENT_END_CONFIG_OK', null, ''));
```

接着每一子组件发出各自的数据，basic-attr-eoo组件发出事件
```
this.mutliEventBus.emit(new MutliEventBusModel('EVENT_END_CONFIG_OK', 'EVENT_END_CONFIG_OK_BASICE', basice组件的数据对象));
```

access-attr组件发出
```
this.mutliEventBus.emit(new MutliEventBusModel('EVENT_END_CONFIG_OK', 'EVENT_END_CONFIG_OK_ACCESS', access组件的数据对象));
```
同理其他两个组件也会发出一个操作类型为：EVENT_END_CONFIG_OK且带上子类型的数据并附带上自己组件的数据。

最后对于事件如果一个组件被注销了，需要手动调用off方法进行事件注销，防止出现重复下发和内存泄漏
```
this.mutliEventBus.off('otn-end-config');
```

对于不存在子操作的操作，使用也是相当简单
```
export class SubEventBus extends EventBus<SubEventBusModel> {

    constructor() {
        super(SubEventBusModel);
    }
}

export class SubEventBusModel extends EventBusModel {
    public static A_B: string = 'A_B';

    constructor(type: any = null, subType: any = null, data: any = null) {
        super(type, subType, data);
        this.def(this, '__ob__', SubEventBusModel);
    }
}
```

事件订阅也是通过on进行：
```
this.subEventBus[SubEventBusModel.A_B] = (subEventBusModel) => {
    console.log(`sub2-test: ${JSON.stringify(subEventBusModel)}`);

    subEventBus.off('sub2-test');
}
this.subEventBus.on('sub2-test', (subEventBusModel: SubEventBusModel) => {
    this.subEventBus[subEventBusModel.type](subEventBusModel);
}, this);
```

对于事件的触发，子操作不需要传递
```
this.SubEventBus.emit(new SubEventBusModel('A_B', null, 'data'));
```
