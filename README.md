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

To be continued...