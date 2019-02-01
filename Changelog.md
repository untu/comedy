### v 2.0.0:
- Implemented hot configuration change.
- **Breaking change:** removed possibility to create actor children from outside of an actor.

### v 1.9.0:
- Added `'disabled'` mode for disabling actors.

### v 1.8.0:
- Added custom logger support.

### v 1.7.0:
- Tested compatibility with NodeJS 10.
- Added actor global lookup capability through `//`.
- Implemented `'threaded'` actors through NodeJS 10 worker threads.

### v 1.6.2:
- Added type definition for `ActorSystem.getBus()`.

### v 1.6.1:
- Added missing type definitions for `SystemBus`. Moved `SystemBus` tests to TypeScript.

### v 1.6.0:
- Added custom balancers.
- Added Babel-transpiled projects support.
- Added system bus.

### v 1.5.1:
- Moved `toobusy-js` to regular dependencies (bugfix).

### v 1.5.0:
- Added random balancer.

### v 1.4.0:
- Added dynamic per-actor logger configuration.
- Fixed `_classCallCheck` problem for compiled code in `'forked'` mode.

### v 1.3.0:
- Index-based clustered actor metrics output format.
- Added `dropMessagesOnOverload` actor parameter support.

### v 1.2.5:
- Fixed `broadcastAndReceive` for non-clustered actor.
- Index-based clustered actor metrics output format.

### v 1.2.4:
- Fixed message routing to crashed actors.

### v 1.2.3:
- Moved ts-node and TypeScript to dev dependencies.

### v 1.2.2:
- Fixed TypeScript resource directory loading.

### v 1.2.1:
- Independent logging for each actor.
- Adjusted TypeScript typings.

### v 1.2.0:
- Added `Actor.getMode()` method.
- Added `Actor.broadcast()` and `Actor.broadcastAndReceive()` methods.
- Fixed premature parent ping in forked actor.
- Added possibility to forward all unknown topics to parent.

### v 1.1.3:
- Fixed wrong cluster distribution in `"remote"` mode.

### v 1.1.2:
- Added multiple host support in `"host"` parameter for remote actors.
- Fixed Node.JS 8.3.0 compatibility bug.
- Fixed unconditional remote actor pinging bug.

### v 1.1.1:
- Added clusterSize parameter support for remote actors using cluster parameter.

### v 1.1.0:
- Fixed metrics on dead actors.
- Removed context support in favour of resources.
- Implemented actor references.

### v 1.0.0:
- Added remote actor support.

### v 0.2.1:
- Added net.Server and http.Server marshalling support.
- Fixed 'channel closed' errors on second and subsequent respawns.

### v 0.2.0:
- Separate resource definitions support.
- Bug fixes.

### v 0.1.0:
- Added support for custom actor parameters.

### v 0.0.3:
- Bug fixes.

### v 0.0.2:
- Added `additionalRequires` actor system option, which allows requiring additional
modules in forked process.
- Added module-based marshaller support.
- Added `Actor.forwardToChild()` method.
- Fixed variable argument messages for forked mode.
- Added `Actor.metrics()` method and the metrics facility.

### v 0.0.1:
- Initial import from SAYMON project with some necessary corrections.