import ModelMan from './ModelMan'
import { makeActionContext } from './util'

let eventMap = {}
export default class Model {
  static on (event, handler) {
    eventMap[event] = eventMap[event] || []
    eventMap[event].push(handler)
  }

  static fire (event, ...args) {
    let observers = eventMap[event]
    if (observers) {
      observers.forEach(o => o(...args))
    }
  }

  constructor (option) {
    Model.fire('init', option)

    let _  = this._ = {
      option: option,
      actions: {},
      mutations: {},
      watch: {},
      actionModMap: {}
    }
    let { modelName, mixins } = option
    let { actions, actionModMap } = _

    // mix module
    let types = ['actions', 'mutations', 'watch']
    types.forEach(type => {
      // mix default module
      if (option[type]) {
        _[type][modelName] = option[type] || {}
      }
      // mix naming modules
      for(let mod in mixins) {
        _[type][mod] = mixins[mod][type] || {}
      }
    })

    // build action-->mod map
    for(let mod in actions) {
      Object.keys(actions[mod]).forEach((action) => {
        actionModMap[action] = mod
      })
    }

    Model.fire('created', this)
  }

  get modelName () {
    return this._.option.modelName
  }

  // wrap all module state() in state
  state () {
    let result = {}

    let mixins = this._.option.mixins
    let _state = this._.option.state
    if (_state) {
      result[this.modelName] = _state()
    }

    for(let mod in mixins) {
      result[mod] = mixins[mod].state()
    }

    return result
  }

  getStateActions (state) {
    return this._.actions[state]
  }

  eachStateWatch (handle) {
    let watch = this._.watch
    for(let state in watch) {
      let stateWatch = watch[state]
      if (!stateWatch) continue
      handle(state, function (eachWatcher) {
        for(let path in stateWatch) {
          let val = stateWatch[path]
          let handler = null
          let option = {}

          if (typeof val === 'function') {
            handler = val
          } else { // object
            option = {...val}
            handler = option.handler
            delete option.handler
          }

          eachWatcher(path, handler, option)
        }
      })
    }
  }

  applyAction (state, action, args) {
    let result = this._.actions[state][action].apply(null, args)
    if (result && result.then) {
      return result
    }
  }

  dispatch (action) {
    let stateKey = this._.actionModMap[action]
    let state = this.getState(stateKey)

    let context = makeActionContext(
      this.getStateMutations(stateKey),
      state[stateKey],
      this.dispatch.bind(this)
    )

    const BIZ_PARAM_INDEX = 1
    let args = Array.from(arguments).slice(BIZ_PARAM_INDEX)
    args.unshift(context)

    let result = this.applyAction(stateKey, action, args)
    if(result && result.then) {
      return result.then(() => {
        return state
      })
    }
  }

  dispatchAll (fn) {
    const BIZ_PARAM_INDEX = 1

    let callers = []
    let subStates = new Set()
    let actionModMap = this._.actionModMap

    function dispatch (action) {
      let stateKey = actionModMap[action]
      let args = Array.from(arguments).slice(BIZ_PARAM_INDEX)

      callers.push({ stateKey, action, args })
      subStates.add(stateKey)
    }

    fn(dispatch)

    let state = this.getState([...subStates])

    return Promise.all(callers.map(({ stateKey, action, args }) => {
      let context = makeActionContext(
        this.getStateMutations(stateKey),
        state[stateKey],
        this.dispatch.bind(this)
      )
      args.unshift(context)

      return this.applyAction(stateKey, action, args)
    })).then(() => { return state })
  }

  getStateMutations (state) {
    return this._.mutations[state]
  }

  getState (states) {
    let allState = this.state()
    if (!states) {
      return allState
    }

    let result = {}
    if (typeof states === 'string') {
      states = [states]
    }
    states.forEach(s => result[s] = allState[s])
    return result
  }
}
