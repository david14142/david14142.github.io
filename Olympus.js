// Olympus
//
// JavaScript functions to facilitate multivariate summaries of data
//
// Copyright (C) 2018 David Schreiber <davidschr@gmail.com>
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

// Olympus.js Core functionality - Data and Index structures.


// Global constants
// a key that can't occur in data, used in margins
const SUBTOTAL = Symbol('oj-subtotal');



(function(global) {

  global.Oj = global.Oj || {} ;
  var Oj = global.Oj;

  // DataFrame constructor
  Oj.DataFrame = function(data) {

    // empty constructor
    if (typeof data == 'undefined') {
      this.data = Object.create(null)
    // ** type 1 : data is an array of arrays.  Each inner array is a row
    } else if (typeof data == 'object' && Array.isArray(data)) {
      this.data = Object.create(null);
      // assume that the first row is column names - copy them
      let header = data[0];
      for(let j=0; j < header.length; j++) {
        this.data[header[j]] = [];
      }
      // now copy the data (starting from the second row)
      for(let i=1; i < data.length; i++) {
        let row = data[i];
        for (let j=0; j < row.length; j++) {
          this.data[header[j]].push(row[j]);
        }
      }

    // ** type 2: data is a collection of arrays.  Each array is a column
    } else if (typeof data == 'object') {
        this.data = data ;
    }

    this.columns = Object.keys(this.data);
    this.indices = Object.create(null);
    this.length = 0;
    this.deleted = [];
    this.isDataFrame = true;

    if (this.columns.length > 0) {
      let longest = this.columns.reduce((r, d) => this.data[r].length > this.data[d].length ? r : d, this.columns[0]);
      this.length = this.data[longest].length;
    }

    this[Symbol.iterator] = function*() {
      for(let i = 0; i < this.length; i++) {
        if (this.deleted[i] !== true) yield i;
      }
    }
  }

  Oj.DataFrame.prototype.delete = function(row) {
    // for (let j=0; j < this.columns.length; j++) {
    //   // need to delete from any indexes that refer to this row
    //   this.data[this.columns[j]][row] = undefined;
    // }
    this.deleted[row] = true;
    // todo: remove from indexes?;
    for (index in this.indices) {
      if (index.type === 'order') {
        let group = [];
        for(j = 0; j < index.columns.length; j++) {
          group.push(this.data[this.columns[j]][row]);
        }
        index.delete(group, row);
      } else if (index.type === 'tree') {
        let group = Object.create(null);
        for (j of index.columns) {
          group[index.columns[j]] = this.data[index.columns[j]][row];
        }
        index.delete(group, row);
      }
    }
  }

  // links columns to a DataFrame
  Oj.DataFrame.prototype.append = function(frame) {
    for(let j=0; j < frame.columns.length; j++) {
      let column = frame.columns[j];
      if (!this.columns.includes(column)) {
        this.columns.push(column)
        this.data[column] = frame.data[column];
      }
    }
    return this;
  }

  // push a row of data onto the bottom of the dataframe
  Oj.DataFrame.prototype.push = function(row) {
    var columns = Object.keys(row);
    for(let j=0; j < columns.length; j++) {
      let column = columns[j];
      if (typeof this.data[column] == 'undefined') {
        this.columns.push(column);
        this.data[column]=[];
      }
      this.data[column].push(row[column]);
    }
    this.length++;
  }

  Oj.DataFrame.prototype.forEach = function(callback) {
    var row;
    for(let i of this) {
      row =  Object.create(null);
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j];
        row[column] = this.data[column][i];
      }
      callback(row, i);
    }
  }

  // insert() replaces a row of data.  Additional columns are added as needed.
  Oj.DataFrame.prototype.insert = function(row, index) {
    if (index > this.length) this.length = index;
    var columns = Object.keys(row);
    for(let j=0; j < columns.length; j++) {
      let column = columns[j];
      if (typeof this.data[column] == 'undefined') {
        this.columns.push(column);
        this.data[column]=[];
      }
      this.data[column][index] = row[column];
    }
  }

  Oj.DataFrame.prototype.map = function(callback, frame) {
    var row;
    var dataset = new Oj.DataFrame();
    for(let i of this) {
      row =  Object.create(null);
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j]
        row[column] = this.data[column][i];
      }
      let result = callback(row, i);
      if (result !== null) dataset.push(result);
    }
    Oj.log('Mapped');
    if (typeof frame == 'undefined') {
      return dataset;
    } else {
      frame.append(dataset);
      return frame;
    }
  }

  // reduce() differs from aggregate in that the callback function takes the result
  // dataframe as its accumulator, and returns a key/value pair.  It is more
  // flexible but more difficult to use than the aggregate function.
  Oj.DataFrame.prototype.reduce = function(expression) {
    var result = Object.create(null);
    var row = Object.create(null);
    for(let i of this) {
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j];
        row[column] = this.data[column][i];
      }
      result = aggregate(expression)(result, row);
    }
    Oj.log('Reduced');
    return result;
  }

  // Fetches row(s) from a frame based on key/values. Not the same as
  // where or scan
  Oj.DataFrame.prototype.find = function(group, name) {
    let index = this.indices[name] || this.indices.primary;
    let i = index.find(group);
    let row =  Object.create(null);
    for (let j=0; j < this.columns.length; j++) {
      let column = this.columns[j];
      if (typeof i == 'number') {
        row[column] = this.data[column][i];
      } else if (typeof i == 'object' && Array.isArray(i)) {
        if (i.length === 1) {
          row[column] = this.data[column][i[0]];
        }
        // todo: need to handle i being an array ;
      }
    }
    return row;
  }

  Oj.DataFrame.prototype.getRow = function(i) {
    var row = [];
    for (let j=0; j < this.columns.length; j++) {
      let column = this.columns[j];
      row.push(this.data[column][i] || null);
    }
    return row;
  }

  // walks out an index, calling callback on each node.
  // (group is passed to each subsequent call)
  Oj.DataFrame.prototype.walk = function(node, callback, group=[]) {
    for (const [key, value] of node) {
      let g = group.concat([key]);
      callback(g, key, value);
      if (value[Symbol.toStringTag] == 'Map') {
        this.walk(value, callback, g);
      }
    }
  }

  // breadth first traversal
  Oj.DataFrame.prototype.breadth = function(node, callback, group=[]) {
    for (const [key, value] of node) {
      let g = group.concat([key]);
      callback(g, key, value, value.leaves);
    }
    for (const [key, value] of node) {
      let g = group.concat([key]);
      if (value[Symbol.toStringTag] == 'Map') {
        this.breadth(value, callback, g);
      }
    }
  }

  // Traverse an index in sorted order.
  // todo : sort different columns differently
  Oj.DataFrame.prototype.sort = function(node, callback, group=[]) {
    let keys = Array.from(node.keys()).sort(numeric);
    for(let k=0; k < keys.length; k++) {
      let g = group.concat(keys[k]);
      let v = node.get(keys[k]);
      callback(g, keys[k], v, (v.leaves || 0), k);
      if (v[Symbol.toStringTag] == 'Map') {
        this.sort(v, callback, g);
      }
    }
  }

  // sort numbers as numbers
  let numeric = function(a, b) {
    if (typeof a == 'object' || typeof b == 'object'
      || typeof a == 'symbol' || typeof b == 'symbol') return 0
    if (Number.isNaN(a - b)) {
      if (a < b) return -1;
      else if (a > b) return 1;
      else if (a === b) return 0;
    } else return a-b;
  }

  Oj.DataFrame.prototype.index = function(name, columns, unique) {
    this.indices[name] = new tree();
    let rv = true;
    if (typeof unique == 'undefined') unique = false;
    let group = Object.create(null);
    for (let i of this) {
      for(let j=0; j < columns.length; j++) {
        group[columns[j]] = this.data[columns[j]][i];
      }
      rv = this.indices[name].insert(group, i, unique);
    }
    return rv;
  }

  // creates a sorting index.  Differs from index() in the treatment of multi-column
  // indexes: order() treats age/sex differently from sex/age
  Oj.DataFrame.prototype.order = function(name, columns, unique) {
    this.indices[name] = new order(columns);
    let rv = true;
    let group = Object.create(null);
    for (let i of this) {
      for(let j=0; j < columns.length; j++) {
        group[columns[j]] = this.data[columns[j]][i];
      }
      rv = this.indices[name].insert(group, i, unique);
    }
    return rv;
  }

  // surface an index - mostly useful for aggregate results to surface the
  // primary key (turn it into columns)
  Oj.DataFrame.prototype.surface  = function(name, rename) {
    let tree = this.indices[name] || this.indices.primary;
    rename = rename || tree.columns;
    if (rename.length < tree.columns.length) rename = tree.columns;
    for (let j=0; j < rename.length; j++) {
      this.data[rename[j]] = [];
    }
    this.columns = Object.keys(this.data);
    this.walk(tree.root,
      (group, key, value) => {
        if (typeof value == 'number') {
          for(let j=0; j < group.length; j++) {
            this.data[rename[j]][value] = group[j];
          }
        } else if (typeof value == 'object' && Array.isArray(value)) {
          for (let i=0; i < value.length; i++) {
            for (let j=0; j < group.length; j++) {
              this.data[rename[j]][value[i]] = group[j];
            }
          }
        }
      }
    );
    return this;
  }

  // traverse a primary index and re-order the results (creates an order)
  Oj.DataFrame.prototype.reorder = function(name, reorder) {
    let tree =  this.indices.primary;
    this.indices[name] = new order(reorder);
    // re-arrange the group ;
    let arrange = [];
    for (let j=0; j < reorder.length; j++) {
      arrange.push(this.indices.primary.columns.indexOf(reorder[j]));
    }
    //this.walk(tree.root,
    this.sort(tree.root,
      (group, key, value) => {
        if (typeof value != 'object') {
          let regroup = Object.create(null);
          for(let j=0; j < arrange.length; j++) {
            regroup[reorder[j]] = group[arrange[j]];
          }
          this.indices[name].insert(regroup, value);
        }
      }
    );
    return this;
  }

  // aggregate() executes multiple callback functions on subsets (groups) of
  // data.  The group is specified as a list (array) of column names (which
  // must) be valid identifiers.  The callback functions are passed as a
  // collection of functions they take a scalar accumulator and row of data.
  Oj.DataFrame.prototype.aggregate = function(columns, expression) {
    var result = new Oj.DataFrame();
    result.indices.primary = new tree();
    var row = Object.create(null);
    var group = Object.create(null);
    for(let i of this) {
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j];
        row[column] = this.data[column][i];
      }
      for (let j=0; j < columns.length; j++) {
        group[columns[j]] = row[columns[j]];
      }
      let item = aggregate(expression)(result.find(group), row);
      // Add the result as part of the frame data if the key already exists
      // returns index, otherwise inserts new key
      let index = result.indices.primary.add(group, result.length);
      if (index !== result.length) {
        result.insert(item, index);
      } else {
        result.push(item);
      }
    }
    Oj.log('Aggregated');
    return result;
  }

  Oj.DataFrame.prototype.where = function(test) {
    var row;
    for (let i of this) {
      row =  Object.create(null);
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j];
        row[column] = this.data[column][i];
      }
      if (test(row, i) !== true) {
        this.delete(i);
      }
    }
  }

  // forms the basis of indexes for dataframes
  let tree = function() {
    this.root = new Map();
    this.type = 'tree';
  }

  // checks for the location of a group, or adds a new one,
  // returns the index value
  tree.prototype.add = function(group, index) {
    this.columns = Object.keys(group).sort();
    var node = this.root;
    for (let j=0; j < this.columns.length - 1; j++) {
      let column = this.columns[j];
      let next = node.get(group[column]);
      if (typeof next == 'undefined') {
        next = new Map();
        node.set(group[column], next);
      }
      node = next ;
    }
    let rv = node.get(group[this.columns[this.columns.length-1]]);
    if (typeof rv == 'undefined') {
      node.set(group[this.columns[this.columns.length-1]], index);
      rv = index;
    }
    return rv;
  }

  tree.prototype.find = function(group) {
    // If the columns in the group are not the same as in the tree this may
    // return invalid data.  So don't do that.
    var columns = Object.keys(group).sort();
    var node = this.root;
    for (let j=0; j < columns.length -1; j++) {
      let column = columns[j];
      let next = node.get(group[column]);
      if (typeof next == 'undefined') return undefined;
      node = next;
    }
    return node.get(group[columns[columns.length-1]]);
  }

  // used when building non-primary indexes
  tree.prototype.insert = function(group, index, unique) {
    // move this so it isn't added on each insert
    this.columns = Object.keys(group).sort();
    var node = this.root;
    for (let j=0; j < this.columns.length - 1; j++) {
      let column = this.columns[j];
      let next = node.get(group[column]);
      if (typeof next == 'undefined') {
        next = new Map();
        node.set(group[column], next);
      }
      node = next ;
    }
    var rows = node.get(group[this.columns[this.columns.length-1]]);
    if (typeof rows == 'undefined') {
      rows = [index];
      node.set(group[this.columns[this.columns.length-1]], rows);
      return true;
    } else {
      if (unique === true) {
        return false ;
      } else {
        rows.push(index)
        node.set(group[this.columns[this.columns.length-1]], rows);
        return true;
      }
    }
  }

  tree.prototype.delete = function(group, index) {
    var keys = Object.keys(group).sort();
    let columns = [];
    for (j of keys) {
      columns.push(group[keys[j]]);
    }
    let children = remove(this.root, columns, index);
    if (children === 0) {
      this.root.delete(key);
    }
  }

  // ordered indexes - used for sorting et al.
  let order = function(columns) {
    this.root = new Map();
    this.columns = columns;
    this.type = 'order';
  }

  // same as tree insert, but columns aren't ordered
  // todo: re-write as a recursive function so leaf count can be maintained
  order.prototype.insert = function(group, index, nodupes) {
    //this.columns = Object.keys(group);
    var node = this.root;
    for (let j=0; j < this.columns.length - 1; j++) {
      let column = this.columns[j];
      let next = node.get(group[column]);
      if (typeof next == 'undefined') {
        next = new Map();
        node.set(group[column], next);
      }
      node = next ;
    }
    var rows = node.get(group[this.columns[this.columns.length-1]]);
    if (typeof rows == 'undefined') {
      rows = [index];
      node.set(group[this.columns[this.columns.length-1]], rows);
      return true;
    } else {
      if (typeof nodupes == 'undefined' || nodupes == false) {
        if (typeof index == 'number') {
          rows.push(index)
        } else {
          rows = rows.concat(index)
        }
        node.set(group[this.columns[this.columns.length-1]], rows);
      }
      return true;
    }
  }

  // note that group is an array, not a collection
  order.prototype.find = function(group) {
    // If the columns in the group are not the same as in the tree this may
    // return invalid data.  So don't do that.
    var node = this.root;
    for (let j=0; j < group.length; j++) {
      let column = group[j];
      let next = node.get(column);
      if (typeof next == 'undefined') return undefined;
      node = next;
    }
    return node;
  }

  order.prototype.delete = function(group, index) {
    let children = remove(this.root, group, index)
    if (children === 0) {
      this.root.delete(key);
    }
  }

  let remove = function(node, group, index) {
    let value = node.get(group[1]);
    if (value[Symbol.toStringTag] == 'Map') {
      let children = remove(value, group.slice(1), index);
      if (children === 0) node.delete(group[1]);
    } else if (typeof value == 'number') {
      node.delete(group[1]);
      return 0;
    } else if (typeof value == 'object' && Array.isArray(value)) {
      let remaining = value.filter(v => v != index);
      return remaining.length;
    }
  }

  // Used by group-by to call a series of reduce functions on a row of data
  // this is a private function, not to be confused with Oj.aggregate
  let aggregate = function(expression) {
    var aggregate = function (results, row) {
      var item = Object.create(null);
      for (e in expression) {
        item[e] = expression[e](results[e], row);
      }
      return item;
    }
    return aggregate;
  }

  Oj.PivotTable = class extends Oj.DataFrame {
    constructor (data, expression, dimensions) {
      super(data);
      if (typeof expression == 'object') {
        this.expression = expression;
      } else {
        throw 'PivotTable: Invalid or missing expression.';
      }
      if (typeof dimensions == 'object'
          && typeof dimensions.rows != 'undefined'
          && typeof dimensions.columns != 'undefined')  {
        this.dimension(dimension.rows, dimension.columns);
      }
    }
  }

  Oj.pivot = function(frame, expression, dimensions) {
    return new Oj.PivotTable(frame.data, expression, dimensions);
  }

  // Overrides DataFrame.map()
  Oj.PivotTable.prototype.map = function(callback, frame) {
    var row;
    var dataset = new Oj.PivotTable(Object.create(null), this.expression, this.dimensions);
    for(let i of this) {
      row =  Object.create(null);
      for (let j=0; j < this.columns.length; j++) {
        let column = this.columns[j]
        row[column] = this.data[column][i];
      }
      let result = callback(row, i);
      if (result !== null) dataset.push(result);
    }
    Oj.log('Mapped');
    if (typeof frame == 'undefined') {
      return dataset;
    } else {
      frame.append(dataset);
      return frame;
    }
  }

  // Build an n-dimensional summary (a kind of cube) of the data.
  // Dimensions is an arrar of arrays.  Each array is a list of fields
  // that belong to the same dimension
  Oj.PivotTable.prototype.dimension = function(dimensions) {
    this.dimensions = dimensions;
    let crosstab = [];
    for (let d=0; d < dimensions.length; d++) {
      crosstab = crosstab.concat(dimensions[d]);
    }
    this.summary = this.aggregate(crosstab, this.expression);
    this.summary.reorder('pivot-order', crosstab);
    // create a margin (a summary) for every dimension ;
    this.margins = [];
    this.total = this.reduce(this.expression);
    let group = Object.create(null);
    for (let d=0; d < dimensions.length; d++) {
      this.margins[d] = this.aggregate(dimensions[d], this.expression);
      this.margins[d].reorder('pivot-order', dimensions[d]);
      this.leaf(this.margins[d].indices['pivot-order'].root);
    }
    // for 3-d pivots, create page totals
    if (this.dimensions.length > 2) {
      let d = dimensions[0].concat(dimensions[2]);
      this.page_total = this.aggregate(d, this.expression);
      this.page_total.reorder('pivot-order', d);
      this.page_grand_total = this.margins[0];
    } else {
      this.page_total = undefined;
      this.page_grand_total = undefined;
    }
    this.subtotals = [];
    this.subtotal_dim = [];
  }

  Oj.PivotTable.prototype.subtotal = function(subtotal) {
    this.subtotals = this.subtotals || [];
    this.subtotal_dim = this.subtotal_dim || [];
    var intersection;
    var columns;

    let addend = function(node, crossing=[]) {
      let keys = Array.from(node.keys());
      for (let k=0; k < keys.length; k++) {
        let key = keys[k];
        let value = node.get(key);
        let c = crossing.concat(key);
        if (value[Symbol.toStringTag] == 'Map') {
          let x = intersection.find(c, 'subtotal-order');
          if (Object.keys(x).length !== 0) {
            let e = {
              subtotal: n,
              row: x
            }
            value.set(SUBTOTAL, e);
          }
          addend(value, c);
        }
      }
    }

    if (this.locate(subtotal) === null) {
      var s = this.aggregate(subtotal, this.expression);
      s.reorder('subtotal-order', subtotal);
      this.subtotals.push(s);
      this.subtotal_dim.push(subtotal);
    }

    // now add to the subtotals to the margins and page_totals
    var n = this.subtotals.length-1;
    for (let m=0; m < this.margins.length; m++) {
      let columns = intersect(this.dimensions[m], subtotal);
      if (columns.length > 0) {
        intersection = this.aggregate(columns, this.expression);
        intersection.reorder('subtotal-order', columns);
        addend(this.margins[m].indices['pivot-order'].root);
        this.leaf(this.margins[m].indices['pivot-order'].root);

        if (typeof this.page_total != 'undefined') {
          let d = this.dimensions[0].concat(this.dimensions[2]);
          let columns = intersect(d, subtotal);
          if (columns.length > 0) {
            intersection = this.aggregate(columns, this.expression);
            intersection.reorder('subtotal-order', columns);
            addend(this.page_total.indices['pivot-order'].root);
            this.leaf(this.page_total.indices['pivot-order'].root);
          }
        }
      }
    }
  }

  // find an intersection of two arrays
  let intersect = function (a, b) {
    let s = new Set(b);
    let intersection = new Set(a.filter(x => s.has(x)));
    return Array.from(intersection);
  }

  // given a a group look for a matching subtotal entry
  Oj.PivotTable.prototype.locate = function(group) {
    if (typeof this.subtotal_dim == 'undefined') return null;
    for (let e=0; e < this.subtotal_dim.length; e++) {
      if (shallow(group, this.subtotal_dim[e])) return e;
    }
    return null;
  }

  let shallow = function(a, b) {
    if (a.length !== b.length) return false;
    else {
      for(let i=0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
  }

  Oj.PivotTable.prototype.navigate = function(i = new Oj.Interface(), crossing=[]) {
    let node = this.margins[i.dimension].indices['pivot-order'].root;
    i.init();
    this.collate(node, i, crossing);
    i.final();
  }

  Oj.PivotTable.prototype.collate = function(node, i, crossing) {
    let keys = Array.from(node.keys()).sort(numeric);
    let subtotals = [];
    var v;
    for(let k=0; k < keys.length; k++) {
      let key = keys[k];
      let value = node.get(key);
      let c = crossing.concat({key, value});
      let group = c.map(e => e.key);
      let g = group.filter(e => e != SUBTOTAL);
      if (value[Symbol.toStringTag] == 'Map') {
        i.begin(group, value.leaves, subtotals);
        this.collate(value, i, c);
        i.end(group, value.leaves, subtotals);
      } else {
        if (i.follow && i.dimension < this.dimensions.length) {
          i.begin(group, 1, subtotals);
          this.navigate(i.follow, c);
          i.end(group, 1, subtotals);
        } else {
          // we don't actually want the value of the last margin (it's a total)
          // instead we look up the crossing in the summary dataset
          if (key === SUBTOTAL) {
            v = this.subtotals[value.subtotal].find(g, 'subtotal-order');
          } else if (typeof value == 'object' && Array.isArray(value)) {
            if (group.includes(SUBTOTAL)) {
              let s = c[group.lastIndexOf(SUBTOTAL)].value.subtotal;
              v = this.subtotals[s].find(g, 'subtotal-order');
            } else {
              v = this.summary.find(group, 'pivot-order');
              v = Object.keys(v).length === 0 ? null : v;
            }
          }
          v = v || null;
          i.interior(group, key, v);
        }
      }
    }
  }

  // Add a leaf count to a margin
  // Todo: explore adding this to the margin creation process.
  Oj.PivotTable.prototype.leaf = function(node) {
    var l = 0;
    for (const [key, value] of node) {
      if (value[Symbol.toStringTag] == 'Map') {
        l += this.leaf(value);
      } else {
        l++
      }
    }
    node.leaves = l;
    return l;
  }

  // apply a callback to the summary and margins (not the raw data)
  // of a pivot table.  Useful for averages & other ratios
  Oj.PivotTable.prototype.ratio = function(callback) {
    this.summary.map(callback, this.summary);
    for(let k=0; k < this.margins.length; k++) {
      this.margins[k].map(callback, this.margins[k]);
    }
    for(let k=0; k < this.subtotals.length; k++) {
      this.subtotals[k].map(callback, this.subtotals[k]);
    }
    let result = callback(this.total);
    for (let j in result) {
      this.total[j] = result[j];
    }
  }

  // Default interface does nothing.
  // See Utility.js for some working implementations
  Oj.Interface = function(dimension=0) {
    this.dimension = dimension;
  }
  Oj.Interface.prototype.init = function() {}
  Oj.Interface.prototype.begin = function() {}
  Oj.Interface.prototype.interior = function() {}
  Oj.Interface.prototype.end = function() {}
  Oj.Interface.prototype.final = function() {}
  // Oj.Interface.prototype.follow =

} (this));

var Oj = Oj || this.Oj ;
