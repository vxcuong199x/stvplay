'use strict'

module.exports = function(server) {
  server.models.ACL.getDataSource().connector.all = all
  server.models.Customer.getDataSource().connector.all = all
}

function all(model, filter, options, callback) {
  const self = this

  filter = filter || {}
  const idName = self.idName(model)
  let query = {}
  if (filter.where) {
    query = self.buildWhere(model, filter.where)
  }
  const fields = filter.fields
  if (fields) {
    this.execute(model, 'find', query, fields, processResponse)
  } else {
    this.execute(model, 'find', query, processResponse)
  }

  function processResponse(err, cursor) {
    if (err) {
      return callback(err)
    }
    const order = {}

    // don't apply sorting if dealing with a geo query
    if (!hasNearFilter(filter.where)) {
      if (!filter.order) {
        const idNames = self.idNames(model)
        if (idNames && idNames.length) {
          filter.order = idNames
        }
      }
      if (filter.order) {
        let keys = filter.order
        if (typeof keys === 'string') {
          keys = keys.split(',')
        }
        for (let index = 0, len = keys.length; index < len; index++) {
          const m = keys[index].match(/\s+(A|DE)SC$/)
          let key = keys[index]
          key = key.replace(/\s+(A|DE)SC$/, '').trim()
          if (key === idName) {
            continue
          }
          if (m && m[1] === 'DE') {
            order[key] = -1
          } else {
            order[key] = 1
          }
        }
      }

      if (Object.keys(order).length)
        cursor.sort(order)
    }

    if (filter.limit) {
      cursor.limit(filter.limit)
    }
    if (filter.skip) {
      cursor.skip(filter.skip)
    } else if (filter.offset) {
      cursor.skip(filter.offset)
    }
    cursor.toArray(function(err, data) {
      if (err) {
        return callback(err)
      }
      const objs = data.map(function(o) {
        if (idIncluded(fields, self.idName(model))) {
          self.setIdValue(model, o, o._id)
        }
        // Don't pass back _id if the fields is set
        if (fields || idName !== '_id') {
          delete o._id
        }
        o = self.fromDatabase(model, o)
        return o
      })
      if (filter && filter.include) {
        self._models[model].model.include(objs, filter.include, options, callback)
      } else {
        callback(null, objs)
      }
    })
  }
}

function hasNearFilter(where) {
  if (!where) return false

  for (const k in where) {
    if (where[k] && typeof where[k] === 'object' && where[k].near) {
      return true
    }
  }

  return false
}

function idIncluded(fields, idName) {
  if (!fields) {
    return true
  }
  if (Array.isArray(fields)) {
    return fields.indexOf(idName) >= 0
  }
  if (fields[idName]) {
    // Included
    return true
  }
  if ((idName in fields) && !fields[idName]) {
    // Excluded
    return false
  }
  for (const f in fields) {
    return !fields[f] // If the fields has exclusion
  }
  return true
}
