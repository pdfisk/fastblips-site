# Splits and tabs: HSplitPanel, VSplitPanel, TabPanel and ListPanel.
#
#   HSplitPanel / VSplitPanel  two panes with a divider the user drags;
#                              set_position is the fraction given to the first
#   TabPanel                   pages chosen by a row of tabs: add_tab(label, widget)
#   ListPanel                  a list to pick from
#
# Choosing a topic in the list shows its tab, and choosing a tab selects its topic:
# two widgets that show the same choice. (Neither loops: selecting what is
# already selected says nothing.) Dragging a divider logs where it went.

page = VPanel()
page.fill()
page.set_padding(6)
page.set_spacing(6)

status = Label("Pick a topic, drag a divider")
status.set_id("status")
status.set_height(24)
page.add(status)

outer = HSplitPanel()
outer.set_id("outer")
outer.set_flex(1)
outer.set_position(0.3)
page.add(outer)

# left: the topics
topics = ListPanel()
topics.set_id("topics")
for topic in ["Overview", "Details", "Log"]:
    topics.add_item(topic)
outer.set_first(topics)

# right: notes above, tabs below
inner = VSplitPanel()
inner.set_id("inner")
inner.set_position(0.35)
outer.set_second(inner)

notes = TextPanel("Notes: type here.")
notes.set_id("notes")
inner.set_first(notes)

tabs = TabPanel()
tabs.set_id("tabs")
inner.set_second(tabs)

overview = VPanel()
overview.set_padding(8)
overview.add(Label("Overview page"))
tabs.add_tab("Overview", overview)

details = HPanel()
details.set_padding(8)
details.set_spacing(6)
details.add(Button("One"))
details.add(Button("Two"))
details.add(Spacer())
tabs.add_tab("Details", details)

log = ListPanel()
log.set_id("log")
log.set_empty_text("(nothing logged yet)")
tabs.add_tab("Log", log)


def remember(text):
    log.add_item(text)
    log.select(log.get_count() - 1)


# Events pass the widget and then a value: the row, the tab, the position.
def picked(widget, index):
    if index >= 0:
        tabs.select(index)


def tab_changed(widget, index):
    topics.select(index)
    status.set_text("Tab: " + widget.get_selected_text())


def moved(widget, position):
    percent = int(position * 100 + 0.5)
    remember(widget.get_id() + " divider at " + str(percent) + "%")


topics.on_select(picked)
tabs.on_select(tab_changed)
outer.on_change(moved)
inner.on_change(moved)
topics.select(0)

# --- buttons that do what the user could do with the mouse
buttons = HPanel()
buttons.set_height(32)
buttons.set_spacing(6)
page.add(buttons)


def wider(button):
    outer.set_position(min(0.8, outer.get_position() + 0.1))


def reset(button):
    outer.set_position(0.3)
    inner.set_position(0.35)


def next_tab(button):
    tabs.select((tabs.get_selected_index() + 1) % tabs.get_count())


for caption, handler, ident in [["Wider list", wider, "wider"], ["Reset dividers", reset, "reset"],
                                ["Next tab", next_tab, "next"]]:
    b = Button(caption)
    b.set_id(ident)
    b.set_width(110)
    b.on_click(handler)
    buttons.add(b)
buttons.add(Spacer())
