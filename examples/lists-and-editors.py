# Lists and editors: ListPanel, TextField, TextPanel and MonacoPanel.
#
#   ListPanel    a list to pick from: add_item, remove_item, set_item, get_item,
#                get_count, clear, select, get_selected_index / get_selected_text,
#                set_empty_text; on_select is called with the list and the row
#   TextField    one line: the task being typed or edited; on_submit is Enter
#   TextPanel    a box of several lines; on_change is called with the text
#   MonacoPanel  a code editor (the editor of VS Code) for a language; it is an
#                ordinary text box until the editor has loaded, and offline
#
# Pick a task to edit it. Run it from a launch window.

page = VPanel()
page.fill()
page.set_padding(6)
page.set_spacing(6)

status = Label("Add some tasks")
status.set_id("status")
status.set_height(24)
page.add(status)

body = HSplitPanel()
body.set_flex(1)
body.set_position(0.45)
page.add(body)

# --- left: the tasks, and what edits them
left = VPanel()
left.set_spacing(6)
body.set_first(left)

tasks = ListPanel()
tasks.set_id("tasks")
tasks.set_empty_text("(no tasks)")
tasks.set_flex(1)
left.add(tasks)

entry_row = HPanel()
entry_row.set_height(28)
entry_row.set_spacing(6)
left.add(entry_row)
entry = TextField("")
entry.set_id("entry")
entry.set_placeholder("A task")
entry.set_flex(1)
entry_row.add(entry)
add_button = Button("Add")
add_button.set_id("add")
add_button.set_width(60)
entry_row.add(add_button)

button_row = HPanel()
button_row.set_height(28)
button_row.set_spacing(6)
left.add(button_row)
rename_button = Button("Rename")
rename_button.set_id("rename")
remove_button = Button("Remove")
remove_button.set_id("remove")
clear_button = Button("Clear all")
clear_button.set_id("clear")
for b in [rename_button, remove_button, clear_button]:
    b.set_width(80)
    button_row.add(b)
button_row.add(Spacer())

count = Label("0 tasks")
count.set_id("count")
count.set_height(24)
left.add(count)


def refresh():
    n = tasks.get_count()
    if n == 1:
        count.set_text("1 task")
    else:
        count.set_text(str(n) + " tasks")


def add_task():
    text = entry.get_text().strip()
    if text == "":
        status.set_text("Type a task first")
        return
    tasks.add_item(text)
    entry.set_text("")
    entry.focus()
    status.set_text("Added " + text)
    refresh()


# The list says which row was picked; -1 means none. (An event is delivered once
# the handler that caused it has finished, so selecting a row inside a handler
# calls this afterwards: add_task does not select the new row, or the field it
# has just cleared would fill up again.)
def picked(widget, index):
    if index >= 0:
        entry.set_text(widget.get_item(index))


def rename():
    i = tasks.get_selected_index()
    text = entry.get_text().strip()
    if i < 0 or text == "":
        status.set_text("Pick a task and type its new name")
        return
    tasks.set_item(i, text)
    status.set_text("Renamed to " + text)


def remove():
    i = tasks.get_selected_index()
    if i < 0:
        status.set_text("Pick a task to remove")
        return
    gone = tasks.get_selected_text()
    tasks.remove_item(i)
    if tasks.get_count() > 0:
        tasks.select(min(i, tasks.get_count() - 1))
    else:
        entry.set_text("")
    status.set_text("Removed " + gone)
    refresh()


def clear_all():
    tasks.clear()
    entry.set_text("")
    status.set_text("Cleared")
    refresh()


tasks.on_select(picked)
entry.on_submit(add_task)
add_button.on_click(add_task)
rename_button.on_click(rename)
remove_button.on_click(remove)
clear_button.on_click(clear_all)

# --- right: a TextPanel for notes, a MonacoPanel for code
right = VSplitPanel()
right.set_position(0.5)
body.set_second(right)

notes_box = VPanel()
right.set_first(notes_box)
notes = TextPanel("Notes about the tasks.")
notes.set_id("notes")
notes.set_flex(1)
notes_box.add(notes)
notes_count = Label("")
notes_count.set_id("notes-count")
notes_count.set_height(22)
notes_box.add(notes_count)


def counted(widget, text):
    notes_count.set_text(str(len(text)) + " characters, " + str(len(text.split())) + " words")


notes.on_change(counted)
counted(notes, notes.get_text())

code_box = VPanel()
right.set_second(code_box)
code = MonacoPanel("print('hello')\nprint('again')\n", "python")
code.set_id("code")
code.set_flex(1)
code_box.add(code)
code_row = HPanel()
code_row.set_height(28)
code_row.set_spacing(6)
code_box.add(code_row)
lock = Button("Lock code")
lock.set_id("lock")
lock.set_width(90)
code_row.add(lock)
code_lines = Label("")
code_lines.set_id("code-lines")
code_lines.set_flex(1)
code_row.add(code_lines)


def lines_changed(widget, text):
    code_lines.set_text(str(len(text.strip().split("\n"))) + " line(s)")


def toggle_lock(button):
    code.set_read_only(not code.is_read_only())
    if code.is_read_only():
        button.set_text("Unlock code")
    else:
        button.set_text("Lock code")


code.on_change(lines_changed)
lock.on_click(toggle_lock)
lines_changed(code, code.get_text())
