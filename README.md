# Comedy

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
    
This will print

    Hello, world!
    
along with some other log messages from a created actor system.