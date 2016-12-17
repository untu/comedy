# Comedy [![Build Status](https://travis-ci.org/untu/comedy.svg?branch=master)](https://travis-ci.org/untu/comedy) [![codecov](https://codecov.io/gh/untu/comedy/branch/master/graph/badge.svg)](https://codecov.io/gh/untu/comedy)

Comedy is a Node.js actor framework.

Actors are all about flexible scalability. After describing your application
in terms of actors, you can scale arbitrary parts of the application to multiple cores on a
single host (by spawning sub-processes) or even to multiple hosts in your network by simply
 modifying the configuration and without changing a single line of code.

## Installation

Comedy is installed with NPM by running:

    npm install comedy
    
After that you can use Comedy framework in your code by requiring `comedy` package.

    var actors = require('comedy');
    
## Quick Start

Running your first actor is as simple as follows:

```javascript
var actors = require('comedy');

var actorSystem = actors(); // Create an actor system.

var myActorPromise = actorSystem
  .rootActor() // Get a root actor reference.
  .then(rootActor => {
    return rootActor.createChild({ // Create a child actor that says hello.
      sayHello: to => {
        console.log(`Hello, ${to}!`)
      }
    });
  });

myActorPromise.then(myActor => {
  // Our actor is ready, we can send messages to it.
  myActor.send('sayHello', 'world');
});
```
    
This will print

    Hello, world!
    
along with some other log messages from a created actor system.

So, the steps required to create and run a minimal actor are the following:

1. *Create an actor system.* You would normally do that in your main (startup) script. There is
a bunch of options that you can pass when creating an actor system, and these options will
be discussed in later sections. For now, we'll be just using the defaults.
2. *Get a reference to a Root actor.* Actors can only be created by other actors, so you need
an initial actor to start from. This actor is called a Root actor, and you can get it from
actor system by using `rootActor()` method. The method returns not the actor itself, but
a Promise of the Root actor. To get an actual reference, we use `Promise.then()` method.
(Comedy uses a [Bluebird](http://bluebirdjs.com/) promise library. For more information 
about promise API, please refer to
[Bluebird documentation](http://bluebirdjs.com/docs/api-reference.html)).
3. *Create your actor as a child of a Root actor by using `createChild()` method.*
This method takes an actor definition as a first argument. An actor definition describes
a behaviour of an actor: it defines what messages an actor can accept and how does it respond
(message handlers) as well as how an actor is initialized and destroyed (lifecycle hooks).
Actor definition can be represented in several formats. In our example, we're using a plain object
actor definition with a single message handler, that handles `sayHello` message. It awaits a 
single `to` argument, prints a message to console and does not respond anything.

### Class-Defined Actors

In previous section we've used plain-object actor definition to create our hello world actor.
Another way to define actor behaviour is to use a class:

```javascript
var actors = require('comedy');

/**
 * Actor definition class.
 */
class MyActor {
  sayHello(to) {
    console.log(`Hello, ${to}!`);
  }
}

actors()
  .rootActor() // Get a root actor reference.
  .then(rootActor => rootActor.createChild(MyActor)) // Create a class-defined child actor.
  .then(myActor => {
    // Our actor is ready, we can send messages to it.
    myActor.send('sayHello', 'world');
  });
```

This example does exactly the same as previous one. The difference is that we have defined our
actor behaviour using a JavaScript class. In this definition, each class method becomes a 
message handler. An instance of `MyActor` class is created together with an actor instance
during actor creation.

The class definition option may be better for several reasons:

- When using classes for defining actor behaviour, you take full advantage of the object-oriented
programming and useful class properties such as inheritance and data encapsulation.
- Your existing application is likely to be already described in terms of classes and their relations.
Given that, it's easy to use any of your existing classes as an actor definition without probably
modifying anything inside this class.

### Module-Defined Actors

If your class is defined in a separate file, making a module (which is most likely the case), you
can simply a specify a path to this module to `createChild()` method.

Let's say, our `MyActor` class from previous example is defined in a separate module called
`MyActor.js` that resides in `actors` folder:

*actors/MyActor.js:*

```javascript
/**
 * Actor definition class.
 */
class MyActor {
  sayHello(to) {
    console.log(`Hello, ${to}!`);
  }
}

module.exports = MyActor;
```

Then we can reference it in `createChild()` method by simply specifying a module path:

```javascript
var actors = require('comedy');

actors()
  .rootActor() // Get a root actor reference.
  .then(rootActor => rootActor.createChild('/actors/MyActor')) // Create a module-defined child actor.
  .then(myActor => {
    // Our actor is ready, we can send messages to it.
    myActor.send('sayHello', 'world');
  });
```

This example would again print "Hello world!".

When we put a slash at the start of our module path, the module is looked-up relative
to the project root (a folder where the `package.json` file is).

##### Important note about code transfer

Though module-defined actor may seem like a mere shortcut for specifying a direct class
reference, it has a subtle difference in case of creating forked actors (separate-process
actors, see below), that you should be aware of. That is: when you create a forked
(separate-process) actor with class-defined behaviour, Comedy serializes the code of your
class definition and passes it to a child actor process, where it is being compiled. This
means that you cannot reference external variables (such as module imports) from your class,
because these external variables won't be recognized by a child process and actor definition
compilation will fail (you can import modules inside your class definition, however, and that
will work).

When using module-defined actors, you have no such problem, because in this case Comedy
simply passes a module path to a child process, where it is then imported using a regular
Node.js module resolution process.

Given the above, module path is a preferred way of specifying actor definition to `createChild()`
method. Class and plain-object definitions may still be a good option when a definition is
simple and self-contained and you don't want to bother creating a separate file for it.

## Scaling

The whole point of actors is the ability to scale on demand. You can turn any actor to a standalone
process and let it utilize additional CPU core. This is done by just using a configuration property,
which can be specified both programmaticaly and using a configuration file. Let's see the programmatic
example first.

### Programmatic configuration

The following example runs `MyActor` actor as a separate operating system process.

```javascript
var actors = require('comedy');

/**
 * Actor definition class.
 */
class MyActor {
  sayHello(to) {
    // Reply with a message, containing self PID.
    return `Hello to ${to} from ${process.pid}!`;
  }
}

// Create an actor system.
var actorSystem = actors();

actorSystem
  // Get a root actor reference.
  .rootActor()
  // Create a class-defined child actor, that is run in a separate process (forked mode).
  .then(rootActor => rootActor.createChild(MyActor, { mode: 'forked' }))
  // Send a message to our forked actor with a self process PID.
  .then(myActor => myActor.sendAndReceive('sayHello', process.pid))
  .then(reply => {
    // Output result.
    console.log(`Actor replied: ${reply}`);
  })
  // Destroy the system, killing all actor processes.
  .finally(() => actorSystem.destroy());
```

In the example above we define `MyActor` with a `sayHello` message handler, which replies
with a string containing the self process PID. Then, like in previous examples, we create
an actor system, get a root actor, and create a child actor with `MyActor` definition.
But here we specify an additional option: `{ mode: 'forked' }`, that tells the actor system
that this actor should be run in a separate process ("forked" mode). Then, once child
actor is created, we send a message with `sayHello` topic and wait for response using
`sendAndReceive` method. For a message body we, again, use self process PID. Once the
response from child actor is received, we print it to console and destroy the actor
system.

The output for this example should contain a string like:

    Actor replied: Hello to 15327 from 15338!
    
As you see, the self PID that we send and the self PID that `MyActor` replies with
are different, which means that they are run in separate processes. The process where
`MyActor` is run will be a child of a process, where an actor system is created, and
the messaging between actors turns from method invocation to an inter-process communication.

If you switch to in-memory mode by changing `mode` option value from "forked" to "in-memory"
(which is a default and is equivalent to just omitting the options in `createChild` method),
then both root actor and `MyActor` actor will be run in the same process, the messaging
between actors will boil down to method invocation and the PIDs in the resulting message
will be the same.
 
```javascript
actorSystem
 .rootActor()
 // ...
 .then(rootActor => rootActor.createChild(MyActor, { mode: 'in-memory' }))
 // ...
```
 
    Actor replied: Hello to 19585 from 19585!
 
### Using configuration file

An alternative for using programmatic actor configuration is a configuration file.
It is a JSON file with an actor name to options mapping, like the one below:

```json
{
  "MyActor": {
    "mode": "in-memory"
  },
  "MyAnotherActor": {
    "mode": "forked"
  }
}
```

The above file states that actor with name `MyActor` should be run in in-memory mode, while
actor named `MyAnotherActor` should be run in forked mode. If you name this file `actors.json`
and place it at the root of your project (a directory where your `package.json` file is),
Comedy will automatically pick this file and use the actor configuration from there.

You can also put your actor configuration file wherever you want and give it arbitrary name,
but in this case you should explicitly specify a path to your actor configuration file
when creating the actor system:

```javascript
var actorSystem = actors({
  config: '/path/to/your/actor-configuration.json'
});
```

You can use both the default `actors.json` configuration file and your custom configuration
file, in which case the configuration from the default `actors.json` file is extended with
the custom configuration (what is missing in custom configuration is looked up in default).

Please note that for a given actor programmatic configuration takes precedence over file
configuration: only those configuration properties that are missing in programmatic
configuration are taken from file configuration. So, for example, if you have programmaticaly
specified that the actor should run in in-memory mode, there is no way to override it
using the file configuration.

### Scaling to multiple instances

Besides forking just one single instance of your actor to a separate process, you can spawn
multiple instances of your actor to multiple separate processes by simply using a 
configuration property. This configuration property is named `clusterSize`. Here is an example:

```javascript
var actors = require('comedy');
var P = require('bluebird');

/**
 * Actor definition class.
 */
class MyActor {
  sayHello(to) {
    // Reply with a message, containing self PID.
    return `Hello to ${to} from ${process.pid}!`;
  }
}

// Create an actor system.
var actorSystem = actors();

actorSystem
  // Get a root actor reference.
  .rootActor()
  // Create a class-defined child actor.
  .then(rootActor => rootActor.createChild(MyActor, {
    mode: 'forked', // Spawn separate process.
    clusterSize: 3 // Spawn 3 instances of this actor to load-balance over.
  }))
  .then(myActor => {
    // Sequentially send 6 messages to our newly-created actor cluster.
    // The messages will be load-balanced between 3 forked actors using
    // the default balancing strategy (round-robin).
    return P.each([1, 2, 3, 4, 5, 6], number => {
      return myActor.sendAndReceive('sayHello', `${process.pid}-${number}`)
        .then(reply => {
          console.log(`Actor replied: ${reply}`);
        });
    });
  })
  .finally(() => actorSystem.destroy());
```

The output for this example will look something like this:

    Actor replied: Hello to 15400-1 from 15410!
    Actor replied: Hello to 15400-2 from 15416!
    Actor replied: Hello to 15400-3 from 15422!
    Actor replied: Hello to 15400-4 from 15410!
    Actor replied: Hello to 15400-5 from 15416!
    Actor replied: Hello to 15400-6 from 15422!
    
As you see, the root actor messages are being round-robin-balanced between 3 child instances of `MyActor` actor.

The `clusterSize` configuration property can be as well used in JSON configuration:

```json
{
  "MyActor": {
    "mode": "forked",
    "clusterSize": 3
  }
}
```

## Actor Lifecycle

Like plain objects, actors live and die. The difference is that an actor instance can be created in a separate
process or even on a separate machine, which is why actor creation and destruction is asynchronous.

An actor lifecycle is represented by the diagram below:

![Actor Lifecycle](docs/images/actor-lifecycle.png)

As you can see from this diagram, an actor passes several states along it's life. These are:

- Initializing
- Working
- Destroying
- Destroyed

Some of the above state transitions can be handled by *lifecycle hooks* - special methods in actor
definition, which are all optional.

These lifecycle hooks are covered in the following sections.

### initialize() lifecycle hook

After an actor instance is created, an actor immediately enters Initializing state. At this point, Comedy
first ensures an actor definition instance is created, and then attempts to call an `initialize()` method
of an actor definition instance.

If an `initialize()` method is absent, an actor immediately enters Working state and is ready to handle
incoming messages.

If an `initialize()` method is present in actor definition, Comedy calls this method passing a self
actor instance reference as an input parameter, and looks at return value. If a return value is a `Promise`,
an actor initialization is considered asynchronous and an actor enters Working state only when
a returned promise is resolved. In other cases actor enters Working state immediately after `initialize()`
returns.

If `initialize()` throws exception or a promise returned from `initialize()` is rejected, the actor initialization
is considered failed, and an actor enters Destroying state, which basically starts actor destruction process
(this will be covered later).

With `initialize()` lifecycle hook you can initialize all the things needed for you actor to work. Very often
you will create child actors exactly in `initialize()`:

```javascript
class MyActor {
  initialize(selfActor) {
    // Create child actor.
    return selfActor.createChild(MyChildActor)
      .then(childActor => {
        // Save created child actor to instance field.
        this.childActor = childActor;
      });
  }
}
```

In the example above, `MyActor` will only start handling incoming messages once it's child actor is created
and fully initialized.

### destroy() lifecycle hook

There are several events that can remove actor from existence:

- a destroy() method has been explicitly called on actor (this can be done by actor itself);
- a parent actor is being destroyed;
- an actor process is killed;
- an actor initialization failed (covered above).

In normal cases an actor is destroyed gracefully, which means that it has a chance to do all necessary clean-up
actions before final termination. These actions include destroying all immediate children and calling a `destroy()`
lifecycle hook on actor definition instance.

`destroy()` lifecycle hook is similar to `initialize()` - it is passed in a self actor reference and is allowed
to return promise, in which case a destruction is considered asynchronous and is only finished once a returned
promise is resolved.

The algorithm of actor destruction is the following:

1. Enter Destroying state. At this point actor no longer accepts incoming messages.
2. Destroy immediate actor children. All errors generated by child destruction process are logged and ignored.
 Children are destroyed simultaneously.
3. Call `destroy()` lifecycle hook on self actor definition instance.
4. Once `destroy()` finishes, enter Destroyed state, notify parent and remove actor from memory.
